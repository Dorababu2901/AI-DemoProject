"""Self-contained SQLite metadata DB for the Sheets agent feature.

Mirrors `sqlfeature.db` so this module needs no Alembic migration.
"""
from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

_DB_PATH = Path(__file__).resolve().parent.parent.parent / "sheetsfeature_meta.db"
SHEETSFEATURE_DB_URL = f"sqlite:///{_DB_PATH.as_posix()}"


class Base(DeclarativeBase):
    pass


engine = create_engine(
    SHEETSFEATURE_DB_URL, future=True, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def init_db() -> None:
    from . import models  # noqa: F401  (register models)

    Base.metadata.create_all(bind=engine)


def get_sheets_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
