"""PDF ingestion pipeline: extract → chunk → embed → upsert into Chroma."""

from __future__ import annotations

import logging
from pathlib import Path
from uuid import UUID

from pypdf import PdfReader

from app.ai.rag.chunking import Chunk, chunk_pages
from app.ai.rag.embeddings import embed_texts
from app.ai.rag.store import delete_attachment_chunks, get_user_collection

logger = logging.getLogger(__name__)


def _extract_pages(pdf_path: Path) -> list[str]:
    """Return per-page text for a PDF. Empty list on parse failure."""
    reader = PdfReader(str(pdf_path))
    pages: list[str] = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:  # noqa: BLE001
            pages.append("")
    return pages


def ingest_pdf(
    *,
    user_id: UUID,
    attachment_id: UUID,
    thread_id: UUID,
    pdf_path: Path,
    filename: str,
) -> tuple[int, int]:
    """Run the full ingest pipeline for one PDF.

    Returns: (page_count, chunk_count). Raises on fatal errors so the caller
    can mark the attachment as failed and surface a useful message.
    """
    if not pdf_path.is_file():
        raise FileNotFoundError(f"PDF not found at {pdf_path}")

    pages = _extract_pages(pdf_path)
    page_count = len(pages)
    if page_count == 0:
        raise ValueError("PDF appears to be empty or unreadable.")

    chunks: list[Chunk] = chunk_pages(pages)
    if not chunks:
        raise ValueError("No extractable text found in PDF (scanned image?).")

    texts = [c.text for c in chunks]
    logger.info(
        "RAG ingest: user=%s attachment=%s pages=%d chunks=%d",
        user_id, attachment_id, page_count, len(chunks),
    )
    vectors = embed_texts(texts)

    coll = get_user_collection(user_id)
    # Idempotency: clear any prior chunks for this attachment first.
    try:
        delete_attachment_chunks(user_id, attachment_id)
    except Exception:  # noqa: BLE001
        # Not fatal on first ingest where nothing exists yet.
        logger.debug("No prior chunks to delete for %s", attachment_id)

    ids = [f"{attachment_id}:{c.chunk_index}" for c in chunks]
    metadatas = [
        {
            "attachment_id": str(attachment_id),
            "thread_id": str(thread_id),
            "user_id": str(user_id),
            "filename": filename,
            "page": c.page,
            "chunk_index": c.chunk_index,
        }
        for c in chunks
    ]
    coll.add(ids=ids, embeddings=vectors, documents=texts, metadatas=metadatas)
    return page_count, len(chunks)
