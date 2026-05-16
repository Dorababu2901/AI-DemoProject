from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any

from sqlalchemy import event, text
from sqlalchemy.engine import Engine

# Tunables for the SQL feature.
DEFAULT_QUERY_TIMEOUT_S = 10


@dataclass
class ExecResult:
    columns: list[str]
    rows: list[list[Any]]
    row_count: int


class QueryTimeoutError(Exception):
    pass


def _attach_sqlite_readonly(engine: Engine) -> None:
    """SQLite enforcement: make connection read-only via query_only pragma."""
    if engine.dialect.name != "sqlite":
        return

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn, _):  # pragma: no cover - simple side effect
        try:
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA query_only = ON;")
            cur.close()
        except Exception:
            pass


def _attach_pg_readonly(engine: Engine) -> None:
    if engine.dialect.name != "postgresql":
        return

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn, _):  # pragma: no cover
        try:
            cur = dbapi_conn.cursor()
            cur.execute("SET default_transaction_read_only = on;")
            cur.close()
        except Exception:
            pass


def harden_engine(engine: Engine) -> Engine:
    _attach_sqlite_readonly(engine)
    _attach_pg_readonly(engine)
    return engine


def execute_with_timeout(engine: Engine, sql: str, *, timeout_s: int | None = None) -> ExecResult:
    timeout = timeout_s or DEFAULT_QUERY_TIMEOUT_S
    box: dict[str, Any] = {}

    def runner() -> None:
        try:
            with engine.connect() as conn:
                conn = conn.execution_options(stream_results=False)
                rs = conn.execute(text(sql))
                cols = list(rs.keys())
                rows = [list(r) for r in rs.fetchall()]
                box["res"] = ExecResult(columns=cols, rows=rows, row_count=len(rows))
        except Exception as e:  # capture for main thread
            box["err"] = e

    th = threading.Thread(target=runner, daemon=True)
    th.start()
    th.join(timeout)
    if th.is_alive():
        raise QueryTimeoutError(f"Query exceeded {timeout}s timeout.")
    if "err" in box:
        raise box["err"]
    return box["res"]
