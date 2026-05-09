"""Query-time retrieval: embed user query, search Chroma, format context."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence
from uuid import UUID

from app.ai.rag.embeddings import embed_query
from app.ai.rag.store import get_user_collection
from app.core.config import get_settings


@dataclass
class RagHit:
    text: str
    filename: str
    page: int
    attachment_id: str
    score: float  # cosine distance — lower is better

    @property
    def citation(self) -> str:
        return f"[{self.filename} p.{self.page}]"


def retrieve(
    *,
    user_id: UUID,
    query: str,
    attachment_ids: Sequence[UUID | str] | None = None,
    top_k: int | None = None,
) -> list[RagHit]:
    """Embed the query and pull top-k chunks from the user's collection.

    `attachment_ids` (optional) restricts the search to a subset of the user's
    documents — typically the PDFs uploaded into the current thread.
    Returns an empty list if the collection is empty or has no docs matching
    the filter.
    """
    settings = get_settings()
    k = top_k or settings.rag_top_k

    coll = get_user_collection(user_id)
    if coll.count() == 0:
        return []

    where: dict | None = None
    if attachment_ids:
        ids = [str(a) for a in attachment_ids]
        where = (
            {"attachment_id": ids[0]}
            if len(ids) == 1
            else {"attachment_id": {"$in": ids}}
        )

    qvec = embed_query(query)
    res = coll.query(
        query_embeddings=[qvec],
        n_results=k,
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[]])[0]

    hits: list[RagHit] = []
    for doc, meta, dist in zip(docs, metas, dists):
        meta = meta or {}
        hits.append(
            RagHit(
                text=doc or "",
                filename=str(meta.get("filename", "document.pdf")),
                page=int(meta.get("page", 0) or 0),
                attachment_id=str(meta.get("attachment_id", "")),
                score=float(dist),
            )
        )
    return hits


def build_context_block(hits: Sequence[RagHit]) -> str:
    """Render retrieved chunks as a single labeled context string."""
    if not hits:
        return ""
    lines = ["=== Retrieved context from user's PDFs ==="]
    for i, h in enumerate(hits, start=1):
        lines.append(f"\n[Source {i}] {h.citation}")
        lines.append(h.text.strip())
    lines.append("\n=== End of context ===")
    return "\n".join(lines)


RAG_SYSTEM_INSTRUCTIONS = (
    "You have access to excerpts from PDF documents the user uploaded "
    "(provided in a 'Retrieved context' block). When answering questions "
    "about those documents:\n"
    "1. Ground your answer ONLY in the retrieved context. Do not invent facts.\n"
    "2. Cite sources inline using the bracketed format shown in the context, "
    "   e.g. [report.pdf p.4]. Cite every claim that comes from a document.\n"
    "3. If the context does not contain the answer, say so explicitly and "
    "   do not speculate.\n"
    "4. If the user's question is unrelated to the documents, answer normally."
)
