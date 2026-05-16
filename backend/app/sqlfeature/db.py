"""Separate SQLAlchemy engine for SQL-feature metadata (connections + history).

Kept out of the main DB so this feature is self-contained — no Alembic
migration needed. Schema is created on import via ``create_all``.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Place DB next to the rest of the backend (same level as app_meta files).
_DB_PATH = Path(__file__).resolve().parent.parent.parent / "sqlfeature_meta.db"
SQLFEATURE_DB_URL = f"sqlite:///{_DB_PATH.as_posix()}"


class Base(DeclarativeBase):
    pass


engine = create_engine(SQLFEATURE_DB_URL, future=True, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def init_db() -> None:
    from . import models  # noqa: F401  (register models)

    Base.metadata.create_all(bind=engine)


def get_sql_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
