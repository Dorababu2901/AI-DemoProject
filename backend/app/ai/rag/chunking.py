"""Text chunking for RAG ingestion.

Uses LangChain's RecursiveCharacterTextSplitter with character-based sizing
that approximates the requested 500–1000 token range (chars/4 ≈ tokens for
English text). Page numbers are preserved on every chunk.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import get_settings


@dataclass
class Chunk:
    text: str
    page: int
    chunk_index: int


def chunk_pages(pages: Sequence[str]) -> list[Chunk]:
    """Split a list of per-page text strings into overlapping chunks.

    Each chunk records the page it originated from so retrieval can cite it.
    Chunks that span multiple pages are tagged with their starting page.
    """
    settings = get_settings()
    # chunk_size/overlap are in characters; ~4 chars per token → 800 chars ≈ 200 tokens.
    # We use a larger size by default for better recall on PDFs.
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.rag_chunk_size,
        chunk_overlap=settings.rag_chunk_overlap,
        separators=["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " ", ""],
        length_function=len,
    )

    chunks: list[Chunk] = []
    idx = 0
    for page_no, page_text in enumerate(pages, start=1):
        text = (page_text or "").strip()
        if not text:
            continue
        for piece in splitter.split_text(text):
            piece = piece.strip()
            if not piece:
                continue
            chunks.append(Chunk(text=piece, page=page_no, chunk_index=idx))
            idx += 1
    return chunks
