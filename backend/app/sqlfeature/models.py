from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class SqlConnection(Base):
    __tablename__ = "sqlfeature_connections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # owner_id is the DemoApp user id. NULL = shared (e.g. seeded Chinook).
    owner_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    dialect: Mapped[str] = mapped_column(String(32))
    encrypted_url: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SqlQueryHistory(Base):
    __tablename__ = "sqlfeature_query_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    connection_id: Mapped[int] = mapped_column(Integer, index=True)
    question: Mapped[str] = mapped_column(Text)
    sql: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
