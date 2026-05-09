"""Attachments API: upload PDFs, check status, list, download, delete.

The upload endpoint validates the file (PDF magic bytes, size cap), persists
it to disk + DB as `pending`, then schedules the RAG ingest as a background
task so the request returns immediately.
"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.db.session import SessionLocal, get_db
from app.schemas.attachment import AttachmentRead
from app.services import attachment_service, chat_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["attachments"])

DbSession = Annotated[Session, Depends(get_db)]

_PDF_MAGIC = b"%PDF-"


def _ingest_in_background(attachment_id: UUID, user_id: UUID) -> None:
    """Open a fresh DB session — BackgroundTasks runs after the request session closes."""
    db = SessionLocal()
    try:
        attachment_service.run_ingest(
            db, attachment_id=attachment_id, user_id=user_id
        )
    finally:
        db.close()


@router.post(
    "/threads/{thread_id}/attachments",
    response_model=AttachmentRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_pdf(
    thread_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
    background: BackgroundTasks,
    file: UploadFile = File(...),
) -> AttachmentRead:
    """Upload a PDF into a chat thread; ingestion runs asynchronously."""
    # Ownership check — raises 404 if not the user's thread.
    chat_service.get_thread(db, thread_id=thread_id, user_id=current_user.id)

    settings = get_settings()
    filename = (file.filename or "document.pdf").strip() or "document.pdf"
    mime = (file.content_type or "application/pdf").lower()

    # 1. Read into memory (cap enforced).
    max_bytes = settings.rag_max_pdf_bytes
    contents = await file.read(max_bytes + 1)
    if len(contents) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"PDF exceeds {max_bytes // (1024 * 1024)} MB limit.",
        )
    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file."
        )

    # 2. Validate it really is a PDF (don't trust client-supplied mime alone).
    if not contents.startswith(_PDF_MAGIC):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF files are supported.",
        )

    # 3. Create the DB row, flush to obtain its id, then write the file using
    #    that id and store the relative path.
    from app.models.attachment import Attachment

    att = Attachment(
        user_id=current_user.id,
        thread_id=thread_id,
        filename=filename,
        mime="application/pdf",
        size_bytes=len(contents),
        status="pending",
        storage_path="",  # set below
    )
    db.add(att)
    db.flush()  # populates att.id without committing

    real_path = attachment_service.storage_path_for(current_user.id, att.id)
    real_path.write_bytes(contents)

    backend_root = real_path
    for _ in range(4):  # backend/storage/attachments/<uid>/<aid>.pdf → backend/
        backend_root = backend_root.parent
    att.storage_path = real_path.relative_to(backend_root).as_posix()
    db.commit()
    db.refresh(att)

    # 4. Kick off ingestion in the background.
    background.add_task(_ingest_in_background, att.id, current_user.id)
    return AttachmentRead.model_validate(att)


@router.get(
    "/threads/{thread_id}/attachments",
    response_model=list[AttachmentRead],
)
def list_thread_attachments(
    thread_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> list:
    chat_service.get_thread(db, thread_id=thread_id, user_id=current_user.id)
    return list(
        attachment_service.list_for_thread(
            db, thread_id=thread_id, user_id=current_user.id
        )
    )


@router.get("/attachments/{attachment_id}", response_model=AttachmentRead)
def get_attachment_status(
    attachment_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> AttachmentRead:
    att = attachment_service.get_attachment(
        db, attachment_id=attachment_id, user_id=current_user.id
    )
    return AttachmentRead.model_validate(att)


@router.get("/attachments/{attachment_id}/file")
def download_attachment(
    attachment_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> FileResponse:
    from pathlib import Path

    att = attachment_service.get_attachment(
        db, attachment_id=attachment_id, user_id=current_user.id
    )
    backend_root = Path(__file__).resolve().parents[2]
    path = backend_root / att.storage_path
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File missing on disk."
        )
    return FileResponse(
        path, media_type="application/pdf", filename=att.filename
    )


@router.delete(
    "/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_attachment(
    attachment_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    attachment_service.delete_attachment(
        db, attachment_id=attachment_id, user_id=current_user.id
    )
