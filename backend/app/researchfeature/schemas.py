"""Pydantic schemas for the structured research digest output.

Defines the contract for paper metadata, per-paper summaries, citations,
agent thought events, and the final synthesized digest. Filled in during
feature implementation.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------- inputs ----------


class ResearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    max_results: Optional[int] = None
    max_iterations: Optional[int] = None


# ---------- arXiv paper metadata ----------


class PaperMetadata(BaseModel):
    """Single arXiv paper. Populated by the search tool."""

    arxiv_id: str
    title: str
    authors: list[str] = []
    abstract: str = ""
    published: Optional[datetime] = None
    updated: Optional[datetime] = None
    pdf_url: Optional[str] = None
    categories: list[str] = []


# ---------- per-paper artifacts ----------


class PaperSummary(BaseModel):
    arxiv_id: str
    summary: str = ""
    key_findings: list[str] = []
    relevance_score: Optional[float] = None  # 0..1


class Citation(BaseModel):
    arxiv_id: str
    quote: str
    page: Optional[int] = None


# ---------- final digest ----------


class ResearchDigest(BaseModel):
    """Synthesized output returned at end of stream."""

    query: str
    papers: list[PaperMetadata] = []
    summaries: list[PaperSummary] = []
    citations: list[Citation] = []
    synthesis: str = ""
    generated_at: datetime = Field(default_factory=datetime.utcnow)


# ---------- streaming agent events ----------


AgentEventType = Literal[
    "thought",
    "tool_call",
    "tool_result",
    "paper_found",
    "paper_summarized",
    "decision",
    "synthesis_chunk",
    "digest",
    "error",
    "done",
]


class AgentEvent(BaseModel):
    """Single SSE event chunk emitted by the agent loop."""

    type: AgentEventType
    data: dict | str | None = None
    iteration: Optional[int] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
