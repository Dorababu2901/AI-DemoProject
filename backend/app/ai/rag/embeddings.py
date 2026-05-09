"""Embeddings client — OpenAI `text-embedding-3-large`.

Centralized so both ingest and query paths embed identically.

Routing:
- If `LITELLM_PROXY_URL` is configured, embeddings are sent through the
  OpenAI-compatible proxy (using `LITELLM_API_KEY`).
- Otherwise, falls back to OpenAI directly using `OPENAI_API_KEY`.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Sequence

from openai import OpenAI

from app.core.config import get_settings


@lru_cache(maxsize=1)
def _client() -> OpenAI:
    settings = get_settings()
    # Prefer the LiteLLM proxy when configured — it's OpenAI-compatible and
    # avoids needing a separate OPENAI_API_KEY in dev environments.
    if settings.litellm_proxy_url:
        return OpenAI(
            api_key=settings.litellm_api_key or "sk-proxy",
            base_url=settings.litellm_proxy_url.rstrip("/"),
        )
    if not settings.openai_api_key:
        raise RuntimeError(
            "Neither LITELLM_PROXY_URL nor OPENAI_API_KEY is configured — "
            "required for RAG embeddings."
        )
    return OpenAI(api_key=settings.openai_api_key)


def embed_texts(texts: Sequence[str], *, batch_size: int = 96) -> list[list[float]]:
    """Embed a list of strings with OpenAI's text-embedding-3-large.

    Returns one vector per input, in the same order.
    """
    if not texts:
        return []
    settings = get_settings()
    model = settings.embedding_model or "text-embedding-3-large"
    client = _client()
    out: list[list[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = list(texts[i : i + batch_size])
        # OpenAI rejects empty strings; replace with a single space.
        batch = [t if t.strip() else " " for t in batch]
        resp = client.embeddings.create(model=model, input=batch)
        out.extend(d.embedding for d in resp.data)
    return out


def embed_query(query: str) -> list[float]:
    return embed_texts([query])[0]

# reload trigger
