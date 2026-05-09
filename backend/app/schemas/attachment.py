"""Pydantic schemas for uploaded attachments (PDF RAG)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


AttachmentStatus = Literal["pending", "indexing", "indexed", "failed"]


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    thread_id: UUID
    filename: str
    mime: str
    size_bytes: int
    page_count: int
    chunk_count: int
    status: AttachmentStatus
    error: str | None = None
    created_at: datetime
    updated_at: datetime
