"""arXiv search tool — uses the `arxiv` Python client.

Runs the (synchronous) `arxiv` library inside a thread so it can be awaited
from FastAPI without blocking the event loop.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

import arxiv

from app.core.config import get_settings

from ..schemas import PaperMetadata

logger = logging.getLogger(__name__)


def _do_search(query: str, max_results: int) -> list[PaperMetadata]:
    client = arxiv.Client(
        page_size=min(max_results, 50), delay_seconds=3.0, num_retries=3
    )
    search = arxiv.Search(
        query=query,
        max_results=max_results,
        sort_by=arxiv.SortCriterion.Relevance,
        sort_order=arxiv.SortOrder.Descending,
    )
    out: list[PaperMetadata] = []
    for r in client.results(search):
        # `r.entry_id` looks like "http://arxiv.org/abs/2403.12345v1"
        arxiv_id = (r.entry_id or "").rsplit("/", 1)[-1]
        out.append(
            PaperMetadata(
                arxiv_id=arxiv_id,
                title=(r.title or "").strip().replace("\n", " "),
                authors=[a.name for a in r.authors],
                abstract=(r.summary or "").strip(),
                published=r.published,
                updated=r.updated,
                pdf_url=r.pdf_url,
                categories=list(r.categories or []),
            )
        )
    return out


async def search_arxiv(
    query: str, max_results: Optional[int] = None
) -> list[PaperMetadata]:
    s = get_settings()
    n = max_results or s.arxiv_max_results
    try:
        return await asyncio.to_thread(_do_search, query, n)
    except Exception as e:  # noqa: BLE001
        logger.exception("arxiv search failed for query=%r", query)
        raise RuntimeError(f"arXiv search failed: {e}") from e
