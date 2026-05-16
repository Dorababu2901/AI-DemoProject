from __future__ import annotations

import json
import logging
import math
from datetime import datetime
from typing import Any

import pandas as pd
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

import litellm

from app.api.deps import CurrentUser
from app.core.config import get_settings

from .db import get_sheets_db, init_db
from .models import SheetDataset, SheetQueryHistory
from .schemas import (
    AskRequest,
    AskResponse,
    DatasetOut,
    GoogleSheetCreate,
    HistoryItem,
    PreviewOut,
)
from .services import pandas_agent
from .services.loader import load_csv, load_xlsx
from .services.sheets_service import (
    SheetsAccessError,
    SheetsAuthError,
    load_sheet_as_dataframe,
)
from .services.storage import dataset_dir, parquet_path

# Suppress LiteLLM banner noise; we already log + fall back ourselves.
litellm.suppress_debug_info = True

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sheets", tags=["sheets"])

PREVIEW_ROWS = 50


# ---------- helpers ----------


def _columns_from_df(df: pd.DataFrame) -> list[str]:
    return [str(c) for c in df.columns.tolist()]


def _save_dataset_snapshot(df: pd.DataFrame, dataset_id: int) -> str:
    path = parquet_path(dataset_id)
    # Ensure all column names are strings (pyarrow requires it).
    df = df.rename(columns={c: str(c) for c in df.columns})
    # Coerce mixed-type object columns to strings — Google Sheets often
    # returns columns where some cells are int and some are str, which
    # pyarrow refuses to convert. Numeric/datetime/bool columns are left
    # untouched so aggregations still work.
    for col in df.columns:
        if df[col].dtype == object:
            sample = df[col].dropna()
            if not sample.empty:
                types = {type(v) for v in sample.head(50)}
                if len(types) > 1 or str in types:
                    df[col] = df[col].where(df[col].isna(), df[col].astype(str))
    df.to_parquet(path, index=False)
    return str(path)


def _load_dataset_df(row: SheetDataset) -> pd.DataFrame:
    return pd.read_parquet(row.storage_path)


def _row_to_out(row: SheetDataset) -> DatasetOut:
    try:
        cols = json.loads(row.columns_json or "[]")
    except json.JSONDecodeError:
        cols = []
    return DatasetOut(
        id=row.id,
        name=row.name,
        source=row.source,
        source_ref=row.source_ref,
        columns=cols,
        row_count=row.row_count,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_owned(db: Session, dataset_id: int, owner_id: str) -> SheetDataset:
    row = db.get(SheetDataset, dataset_id)
    if not row or row.owner_id != owner_id:
        raise HTTPException(404, "Dataset not found")
    return row


def _df_to_json_safe_rows(df: pd.DataFrame) -> list[list[Any]]:
    """Convert DataFrame rows to JSON-safe lists (NaN → None, dates → iso)."""
    out: list[list[Any]] = []
    for _, row in df.iterrows():
        cells: list[Any] = []
        for v in row.tolist():
            if isinstance(v, float) and math.isnan(v):
                cells.append(None)
            elif isinstance(v, (pd.Timestamp, datetime)):
                cells.append(v.isoformat())
            elif isinstance(v, (int, float, str, bool)) or v is None:
                cells.append(v)
            else:
                cells.append(str(v))
        out.append(cells)
    return out


def _persist_dataset(
    db: Session,
    *,
    owner_id: str,
    name: str,
    source: str,
    source_ref: str | None,
    df: pd.DataFrame,
) -> SheetDataset:
    if df.empty:
        raise HTTPException(400, "The provided sheet/file has no rows.")
    cols = _columns_from_df(df)
    row = SheetDataset(
        owner_id=owner_id,
        name=name,
        source=source,
        source_ref=source_ref,
        storage_path="",  # filled after we know the id
        columns_json=json.dumps(cols),
        row_count=int(len(df)),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    try:
        row.storage_path = _save_dataset_snapshot(df, row.id)
        db.commit()
        db.refresh(row)
    except Exception:
        # Roll back the half-created row so we don't leak metadata.
        try:
            db.delete(row)
            db.commit()
        except Exception:
            db.rollback()
        raise
    return row


# ---------- datasets ----------


@router.get("/datasets", response_model=list[DatasetOut])
def list_datasets(
    user: CurrentUser, db: Session = Depends(get_sheets_db)
) -> list[DatasetOut]:
    rows = (
        db.query(SheetDataset)
        .filter(SheetDataset.owner_id == str(user.id))
        .order_by(SheetDataset.created_at.desc())
        .all()
    )
    return [_row_to_out(r) for r in rows]


@router.post(
    "/datasets/upload",
    response_model=DatasetOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_dataset(
    user: CurrentUser,
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    worksheet: str | None = Form(default=None),
    db: Session = Depends(get_sheets_db),
) -> DatasetOut:
    s = get_settings()
    raw = await file.read()
    if len(raw) > s.sheets_max_upload_bytes:
        raise HTTPException(
            413,
            f"File too large ({len(raw)} bytes). "
            f"Max is {s.sheets_max_upload_bytes} bytes.",
        )
    filename = (file.filename or "upload").lower()
    try:
        if filename.endswith(".csv"):
            df = load_csv(raw)
            source = "csv"
        elif filename.endswith(".xlsx") or filename.endswith(".xls"):
            df = load_xlsx(raw, worksheet=worksheet)
            source = "xlsx"
        else:
            raise HTTPException(400, "Only .csv, .xlsx, .xls files are supported.")
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        logger.exception("Failed to parse upload %s", file.filename)
        raise HTTPException(400, f"Could not parse file: {e}") from e

    row = _persist_dataset(
        db,
        owner_id=str(user.id),
        name=name or file.filename or f"dataset-{datetime.utcnow().isoformat()}",
        source=source,
        source_ref=file.filename,
        df=df,
    )
    return _row_to_out(row)


@router.post(
    "/datasets/google",
    response_model=DatasetOut,
    status_code=status.HTTP_201_CREATED,
)
def create_google_dataset(
    payload: GoogleSheetCreate,
    user: CurrentUser,
    db: Session = Depends(get_sheets_db),
) -> DatasetOut:
    try:
        df = load_sheet_as_dataframe(payload.sheet_url, worksheet=payload.worksheet)
    except SheetsAuthError as e:
        raise HTTPException(400, str(e)) from e
    except SheetsAccessError as e:
        raise HTTPException(403, str(e)) from e
    except Exception as e:  # noqa: BLE001
        logger.exception("Failed to load Google Sheet %s", payload.sheet_url)
        raise HTTPException(400, f"Failed to load sheet: {e}") from e

    row = _persist_dataset(
        db,
        owner_id=str(user.id),
        name=payload.name,
        source="google_sheet",
        source_ref=payload.sheet_url,
        df=df,
    )
    return _row_to_out(row)


@router.get("/datasets/{dataset_id}", response_model=DatasetOut)
def get_dataset(
    dataset_id: int,
    user: CurrentUser,
    db: Session = Depends(get_sheets_db),
) -> DatasetOut:
    row = _get_owned(db, dataset_id, str(user.id))
    return _row_to_out(row)


@router.get("/datasets/{dataset_id}/preview", response_model=PreviewOut)
def preview_dataset(
    dataset_id: int,
    user: CurrentUser,
    db: Session = Depends(get_sheets_db),
) -> PreviewOut:
    row = _get_owned(db, dataset_id, str(user.id))
    try:
        df = _load_dataset_df(row)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"Could not read dataset: {e}") from e
    head = df.head(PREVIEW_ROWS)
    return PreviewOut(
        columns=_columns_from_df(head),
        dtypes={str(c): str(t) for c, t in df.dtypes.items()},
        rows=_df_to_json_safe_rows(head),
        row_count=int(len(df)),
    )


@router.delete("/datasets/{dataset_id}", status_code=204)
def delete_dataset(
    dataset_id: int,
    user: CurrentUser,
    db: Session = Depends(get_sheets_db),
) -> None:
    row = _get_owned(db, dataset_id, str(user.id))
    # Best-effort wipe of files.
    try:
        d = dataset_dir(row.id)
        for p in d.glob("*"):
            try:
                p.unlink()
            except Exception:
                pass
        try:
            d.rmdir()
        except Exception:
            pass
    except Exception:
        pass
    db.query(SheetQueryHistory).filter(
        SheetQueryHistory.dataset_id == row.id,
        SheetQueryHistory.owner_id == row.owner_id,
    ).delete()
    db.delete(row)
    db.commit()


# ---------- ask ----------


@router.post("/datasets/{dataset_id}/ask", response_model=AskResponse)
def ask(
    dataset_id: int,
    payload: AskRequest,
    user: CurrentUser,
    db: Session = Depends(get_sheets_db),
) -> AskResponse:
    row = _get_owned(db, dataset_id, str(user.id))
    try:
        df = _load_dataset_df(row)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"Could not read dataset: {e}") from e

    # Prepend short conversational history into the question for context.
    question = payload.question
    if payload.history:
        recent = payload.history[-6:]
        ctx = "\n".join(f"{m.get('role','user')}: {m.get('content','')}" for m in recent)
        question = f"Conversation so far:\n{ctx}\n\nNew question: {payload.question}"

    try:
        result = pandas_agent.ask_dataframe(df, question)
    except Exception as e:  # noqa: BLE001
        logger.exception("pandas agent failed for dataset_id=%s", dataset_id)
        msg = str(e)
        if "503" in msg or "overloaded" in msg.lower() or "internalservererror" in msg.lower():
            raise HTTPException(
                503,
                "The AI provider is temporarily unavailable. Please retry in a few seconds.",
            ) from e
        raise HTTPException(502, f"LLM error: {e}") from e

    answer = result.get("answer", "")
    code = result.get("code")

    hist = SheetQueryHistory(
        owner_id=str(user.id),
        dataset_id=row.id,
        question=payload.question,
        answer=answer,
        code=code,
    )
    db.add(hist)
    db.commit()
    db.refresh(hist)

    return AskResponse(
        answer=answer,
        code=code,
        columns=None,
        rows=None,
        history_id=hist.id,
    )


@router.get("/datasets/{dataset_id}/history", response_model=list[HistoryItem])
def history(
    dataset_id: int,
    user: CurrentUser,
    db: Session = Depends(get_sheets_db),
) -> list[HistoryItem]:
    _get_owned(db, dataset_id, str(user.id))  # auth check
    rows = (
        db.query(SheetQueryHistory)
        .filter(
            SheetQueryHistory.dataset_id == dataset_id,
            SheetQueryHistory.owner_id == str(user.id),
        )
        .order_by(SheetQueryHistory.created_at.desc())
        .limit(100)
        .all()
    )
    return [HistoryItem.model_validate(r) for r in rows]


# ---------- bootstrap ----------


def initialize() -> None:
    init_db()
