from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class SheetDataset(Base):
    __tablename__ = "sheetsfeature_datasets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    # "csv" | "xlsx" | "google_sheet"
    source: Mapped[str] = mapped_column(String(32))
    # Original URL or filename (for display only).
    source_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Path to the parquet snapshot on disk.
    storage_path: Mapped[str] = mapped_column(Text)
    # JSON-encoded list of column names.
    columns_json: Mapped[str] = mapped_column(Text, default="[]")
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SheetQueryHistory(Base):
    __tablename__ = "sheetsfeature_query_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(64), index=True)
    dataset_id: Mapped[int] = mapped_column(Integer, index=True)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text, default="")
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
