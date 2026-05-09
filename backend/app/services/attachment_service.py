"""Attachment storage + RAG ingest orchestration (DB layer)."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Sequence
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.rag.ingest import ingest_pdf
from app.ai.rag.store import delete_attachment_chunks
from app.core.config import get_settings
from app.models.attachment import Attachment

logger = logging.getLogger(__name__)


def _backend_root() -> Path:
    # backend/app/services/attachment_service.py → parents[2] == backend/
    return Path(__file__).resolve().parents[2]


def _attachments_root() -> Path:
    raw = get_settings().attachments_dir
    p = Path(raw)
    if not p.is_absolute():
        p = _backend_root() / p
    p.mkdir(parents=True, exist_ok=True)
    return p


def storage_path_for(user_id: UUID, attachment_id: UUID) -> Path:
    folder = _attachments_root() / str(user_id)
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{attachment_id}.pdf"


def create_pending(
    db: Session,
    *,
    user_id: UUID,
    thread_id: UUID,
    filename: str,
    mime: str,
    size_bytes: int,
    storage_path: Path,
) -> Attachment:
    rel = storage_path.relative_to(_backend_root()).as_posix()
    att = Attachment(
        user_id=user_id,
        thread_id=thread_id,
        filename=filename,
        mime=mime,
        size_bytes=size_bytes,
        storage_path=rel,
        status="pending",
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return att


def get_attachment(
    db: Session, *, attachment_id: UUID, user_id: UUID
) -> Attachment:
    stmt = select(Attachment).where(
        Attachment.id == attachment_id, Attachment.user_id == user_id
    )
    att = db.scalar(stmt)
    if att is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found"
        )
    return att


def list_for_thread(
    db: Session, *, thread_id: UUID, user_id: UUID
) -> Sequence[Attachment]:
    stmt = (
        select(Attachment)
        .where(Attachment.thread_id == thread_id, Attachment.user_id == user_id)
        .order_by(Attachment.created_at.asc())
    )
    return db.scalars(stmt).all()


def list_indexed_for_thread(
    db: Session, *, thread_id: UUID, user_id: UUID
) -> list[Attachment]:
    stmt = (
        select(Attachment)
        .where(
            Attachment.thread_id == thread_id,
            Attachment.user_id == user_id,
            Attachment.status == "indexed",
        )
        .order_by(Attachment.created_at.asc())
    )
    return list(db.scalars(stmt).all())


def run_ingest(db: Session, *, attachment_id: UUID, user_id: UUID) -> None:
    """Background task: parse + embed + store. Updates row status."""
    att = db.get(Attachment, attachment_id)
    if att is None or att.user_id != user_id:
        logger.warning("run_ingest: attachment %s missing or not owned", attachment_id)
        return

    att.status = "indexing"
    att.error = None
    db.add(att)
    db.commit()

    try:
        pdf_path = _backend_root() / att.storage_path
        page_count, chunk_count = ingest_pdf(
            user_id=user_id,
            attachment_id=att.id,
            thread_id=att.thread_id,
            pdf_path=pdf_path,
            filename=att.filename,
        )
        att.page_count = page_count
        att.chunk_count = chunk_count
        att.status = "indexed"
        att.error = None
    except Exception as exc:  # noqa: BLE001
        logger.exception("RAG ingest failed for attachment %s", attachment_id)
        att.status = "failed"
        att.error = str(exc)[:1000]
    finally:
        db.add(att)
        db.commit()


def delete_attachment(
    db: Session, *, attachment_id: UUID, user_id: UUID
) -> None:
    att = get_attachment(db, attachment_id=attachment_id, user_id=user_id)
    # Remove vectors first (best-effort), then file, then DB row.
    try:
        delete_attachment_chunks(user_id, att.id)
    except Exception:  # noqa: BLE001
        logger.warning("Failed to delete vectors for %s", att.id, exc_info=True)
    try:
        path = _backend_root() / att.storage_path
        if path.is_file():
            path.unlink()
    except Exception:  # noqa: BLE001
        logger.warning("Failed to delete file %s", att.storage_path, exc_info=True)
    db.delete(att)
    db.commit()
