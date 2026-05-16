from __future__ import annotations

import logging
from pathlib import Path
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import create_engine, or_
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser

from .db import get_sql_db, init_db
from .models import SqlConnection, SqlQueryHistory
from .schemas import (
    ConnectionCreate,
    ConnectionOut,
    ExplainRequest,
    ExplainResponse,
    HistoryItem,
    QueryRequest,
    QueryResponse,
    SchemaOut,
)
from .security import decrypt, encrypt
from .services import nl2sql
from .services.executor import (
    DEFAULT_QUERY_TIMEOUT_S,
    QueryTimeoutError,
    execute_with_timeout,
    harden_engine,
)
from .services.introspect import introspect
from .services.seed_chinook import ensure_chinook
from .services.sql_guard import UnsafeSQLError, guard_sql

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sql", tags=["sql"])

# Engine cache keyed by (connection_id, encrypted_url) so we don't open a new
# pool per request — important for Supabase poolers (capped at ~15 clients).
_ENGINE_CACHE: dict[tuple[int, str], Engine] = {}
_ENGINE_LOCK = Lock()
DEFAULT_ROW_LIMIT = 100


def _build_engine(url: str) -> Engine:
    eng = create_engine(
        url,
        future=True,
        pool_pre_ping=True,
        pool_size=2,
        max_overflow=2,
        pool_recycle=300,
        pool_timeout=10,
    )
    return harden_engine(eng)


def _engine_for(conn: SqlConnection) -> Engine:
    key = (conn.id, conn.encrypted_url)
    eng = _ENGINE_CACHE.get(key)
    if eng is not None:
        return eng
    with _ENGINE_LOCK:
        eng = _ENGINE_CACHE.get(key)
        if eng is None:
            url = decrypt(conn.encrypted_url)
            eng = _build_engine(url)
            for k in [k for k in _ENGINE_CACHE if k[0] == conn.id and k != key]:
                try:
                    _ENGINE_CACHE.pop(k).dispose()
                except Exception:
                    pass
            _ENGINE_CACHE[key] = eng
    return eng


def _drop_engine(conn_id: int) -> None:
    with _ENGINE_LOCK:
        for k in [k for k in _ENGINE_CACHE if k[0] == conn_id]:
            try:
                _ENGINE_CACHE.pop(k).dispose()
            except Exception:
                pass


def _get_owned(db: Session, conn_id: int, owner_id: str) -> SqlConnection:
    """Connection visible to current user (owned by them OR shared/NULL)."""
    row = db.get(SqlConnection, conn_id)
    if not row:
        raise HTTPException(404, "Connection not found")
    if row.owner_id not in (None, owner_id):
        raise HTTPException(404, "Connection not found")
    return row


# ---------- connections ----------

@router.post("/connections", response_model=ConnectionOut, status_code=status.HTTP_201_CREATED)
def create_connection(
    payload: ConnectionCreate,
    user: CurrentUser,
    db: Session = Depends(get_sql_db),
) -> ConnectionOut:
    try:
        test_eng = create_engine(payload.connection_string, future=True, pool_pre_ping=True)
        try:
            with test_eng.connect():
                pass
        finally:
            test_eng.dispose()
    except SQLAlchemyError as e:
        raise HTTPException(status_code=400, detail=f"Could not connect: {e}") from e

    exists = (
        db.query(SqlConnection)
        .filter(SqlConnection.name == payload.name, SqlConnection.owner_id == str(user.id))
        .first()
    )
    if exists:
        raise HTTPException(status_code=409, detail="Connection name already exists.")

    row = SqlConnection(
        owner_id=str(user.id),
        name=payload.name,
        dialect=payload.dialect,
        encrypted_url=encrypt(payload.connection_string),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ConnectionOut.model_validate(row)


@router.get("/connections", response_model=list[ConnectionOut])
def list_connections(user: CurrentUser, db: Session = Depends(get_sql_db)) -> list[ConnectionOut]:
    rows = (
        db.query(SqlConnection)
        .filter(or_(SqlConnection.owner_id == str(user.id), SqlConnection.owner_id.is_(None)))
        .order_by(SqlConnection.created_at.desc())
        .all()
    )
    return [ConnectionOut.model_validate(r) for r in rows]


@router.delete("/connections/{conn_id}", status_code=204)
def delete_connection(
    conn_id: int,
    user: CurrentUser,
    db: Session = Depends(get_sql_db),
) -> None:
    row = _get_owned(db, conn_id, str(user.id))
    if row.owner_id is None:
        raise HTTPException(403, "Cannot delete a shared connection.")
    _drop_engine(conn_id)
    db.delete(row)
    db.commit()


@router.get("/connections/{conn_id}/schema", response_model=SchemaOut)
def get_schema(
    conn_id: int,
    user: CurrentUser,
    db: Session = Depends(get_sql_db),
) -> SchemaOut:
    row = _get_owned(db, conn_id, str(user.id))
    try:
        eng = _engine_for(row)
        return introspect(eng)
    except SQLAlchemyError as e:
        raise HTTPException(500, f"Schema introspection failed: {e}") from e


@router.get("/connections/{conn_id}/history", response_model=list[HistoryItem])
def history(
    conn_id: int,
    user: CurrentUser,
    db: Session = Depends(get_sql_db),
) -> list[HistoryItem]:
    _get_owned(db, conn_id, str(user.id))  # auth check
    rows = (
        db.query(SqlQueryHistory)
        .filter(SqlQueryHistory.connection_id == conn_id, SqlQueryHistory.owner_id == str(user.id))
        .order_by(SqlQueryHistory.created_at.desc())
        .limit(100)
        .all()
    )
    return [HistoryItem.model_validate(r) for r in rows]


# ---------- query ----------

@router.post("/query", response_model=QueryResponse)
def run_query(
    payload: QueryRequest,
    user: CurrentUser,
    db: Session = Depends(get_sql_db),
) -> QueryResponse:
    conn_row = _get_owned(db, payload.connection_id, str(user.id))
    engine = _engine_for(conn_row)

    schema = introspect(engine)
    try:
        sql, chart = nl2sql.generate_sql(
            question=payload.question, schema=schema,
            history=payload.history, default_limit=DEFAULT_ROW_LIMIT,
        )
    except Exception as e:
        logger.exception("nl2sql.generate_sql failed for connection_id=%s", payload.connection_id)
        msg = str(e)
        if "Internal Server Error" in msg or "InternalServerError" in msg or "503" in msg or "overloaded" in msg.lower():
            raise HTTPException(
                503,
                "The AI provider is temporarily unavailable (Gemini upstream error). "
                "Please retry in a few seconds. If it persists, try a simpler question or switch models.",
            ) from e
        raise HTTPException(502, f"LLM error: {e}") from e

    try:
        guarded = guard_sql(sql, dialect=conn_row.dialect, default_limit=DEFAULT_ROW_LIMIT)
    except UnsafeSQLError as e:
        raise HTTPException(400, f"Unsafe SQL: {e}") from e

    try:
        exec_res = execute_with_timeout(engine, guarded.sql, timeout_s=DEFAULT_QUERY_TIMEOUT_S)
    except QueryTimeoutError as e:
        raise HTTPException(408, str(e)) from e
    except Exception as e:
        raise HTTPException(400, f"Execution failed: {e}") from e

    explanation = nl2sql.explain_result(
        question=payload.question, sql=guarded.sql,
        columns=exec_res.columns, rows=exec_res.rows,
    )

    hist = SqlQueryHistory(
        owner_id=str(user.id),
        connection_id=payload.connection_id,
        question=payload.question,
        sql=guarded.sql,
        explanation=explanation,
    )
    db.add(hist)
    db.commit()
    db.refresh(hist)

    return QueryResponse(
        sql=guarded.sql,
        columns=exec_res.columns,
        rows=exec_res.rows,
        row_count=exec_res.row_count,
        explanation=explanation,
        suggested_chart=chart,
        history_id=hist.id,
    )


@router.post("/query/explain", response_model=ExplainResponse)
def explain(payload: ExplainRequest, user: CurrentUser) -> ExplainResponse:
    text = nl2sql.explain_result(
        question=payload.question, sql=payload.sql,
        columns=payload.columns, rows=payload.rows,
    )
    return ExplainResponse(explanation=text)


# ---------- bootstrap ----------

def initialize() -> None:
    """Create tables and seed a shared Chinook SQLite connection on startup."""
    init_db()
    # Seed Chinook (shared, owner_id=NULL) so every user has something to play with.
    backend_root = Path(__file__).resolve().parent.parent.parent
    chinook_path = backend_root / "data" / "chinook.db"
    try:
        ensure_chinook(chinook_path)
    except Exception as e:
        print(f"[sqlfeature] chinook seed skipped: {e}")
        return

    from .db import SessionLocal
    db = SessionLocal()
    try:
        existing = (
            db.query(SqlConnection)
            .filter(SqlConnection.owner_id.is_(None), SqlConnection.name == "Chinook (SQLite, shared)")
            .first()
        )
        if not existing:
            url = f"sqlite:///{chinook_path.resolve().as_posix()}"
            db.add(SqlConnection(
                owner_id=None,
                name="Chinook (SQLite, shared)",
                dialect="sqlite",
                encrypted_url=encrypt(url),
            ))
            db.commit()
    finally:
        db.close()
