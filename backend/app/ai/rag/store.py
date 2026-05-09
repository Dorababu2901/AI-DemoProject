"""ChromaDB persistent client + per-user collection helpers.

Each user has an isolated collection named `user_{user_id}_pdf` so their
documents are physically separated. We DO NOT supply Chroma's built-in
embedding function — we precompute embeddings ourselves with OpenAI's
`text-embedding-3-large` (3072 dims) so we control the model + batching.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from uuid import UUID

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.core.config import get_settings


def _backend_root() -> Path:
    """Resolve backend/ root regardless of cwd."""
    # this file: backend/app/ai/rag/store.py  →  parents[3] == backend/
    return Path(__file__).resolve().parents[3]


def _persist_path() -> Path:
    raw = get_settings().chroma_persist_dir
    p = Path(raw)
    if not p.is_absolute():
        p = _backend_root() / p
    p.mkdir(parents=True, exist_ok=True)
    return p


@lru_cache(maxsize=1)
def get_chroma_client() -> chromadb.PersistentClient:
    """Return a process-wide singleton PersistentClient."""
    return chromadb.PersistentClient(
        path=str(_persist_path()),
        settings=ChromaSettings(anonymized_telemetry=False, allow_reset=False),
    )


def user_collection_name(user_id: UUID | str) -> str:
    # Chroma collection names must be 3-512 chars, [a-zA-Z0-9._-], no consecutive dots.
    return f"user_{str(user_id).replace('-', '')}_pdf"


def get_user_collection(user_id: UUID | str):
    """Get-or-create the user's PDF collection.

    Embeddings are supplied explicitly on add()/query() — we set
    `embedding_function=None` to disable Chroma's default ONNX embedder.
    """
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=user_collection_name(user_id),
        metadata={"hnsw:space": "cosine"},
        embedding_function=None,  # type: ignore[arg-type]
    )


def delete_attachment_chunks(user_id: UUID | str, attachment_id: UUID | str) -> None:
    """Remove all chunks belonging to a single attachment."""
    coll = get_user_collection(user_id)
    coll.delete(where={"attachment_id": str(attachment_id)})
