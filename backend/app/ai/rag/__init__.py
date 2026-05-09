"""Retrieval-Augmented Generation: PDF ingest + Chroma retrieval."""

from app.ai.rag.store import (
    get_chroma_client,
    get_user_collection,
    user_collection_name,
)
from app.ai.rag.chunking import chunk_pages
from app.ai.rag.ingest import ingest_pdf
from app.ai.rag.retriever import retrieve, build_context_block, RagHit

__all__ = [
    "get_chroma_client",
    "get_user_collection",
    "user_collection_name",
    "chunk_pages",
    "ingest_pdf",
    "retrieve",
    "build_context_block",
    "RagHit",
]
