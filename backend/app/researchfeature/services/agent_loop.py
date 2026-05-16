"""Autonomous research agent loop.

Drives a search → summarize → evaluate → (loop or synthesize) cycle and
yields ``AgentEvent`` chunks suitable for SSE streaming.

Uses LiteLLM (via the existing proxy configuration) for summaries and
synthesis. The "evidence threshold" is a simple count of summaries with
``relevance_score >= 0.5`` — the planner stops searching once it has at
least ``settings.agent_evidence_threshold`` such papers, or after
``settings.agent_max_iterations`` cycles.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

import litellm

from app.core.config import get_settings

from ..schemas import (
    AgentEvent,
    Citation,
    PaperMetadata,
    PaperSummary,
    ResearchDigest,
    ResearchRequest,
)
from .arxiv_search import search_arxiv

logger = logging.getLogger(__name__)

litellm.suppress_debug_info = True

# ---------- LLM helpers (mirror sheetsfeature/pandas_agent for consistency) ----------


def _ensure_provider_env() -> None:
    s = get_settings()
    pairs = {
        "OPENAI_API_KEY": s.openai_api_key,
        "ANTHROPIC_API_KEY": s.anthropic_api_key,
        "GOOGLE_API_KEY": s.google_api_key,
    }
    for k, v in pairs.items():
        if v and not os.environ.get(k):
            os.environ[k] = v


def _is_transient(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(
        s in msg
        for s in (
            "internal server error",
            "internalservererror",
            "503",
            "504",
            "timeout",
            "timed out",
            "rate limit",
            "overloaded",
            "service unavailable",
        )
    )


async def _llm_chat(*, system: str, user: str, model: str | None = None) -> str:
    s = get_settings()
    _ensure_provider_env()
    candidates = [model or s.default_llm_model, *s.llm_fallback_models_list]
    last_exc: Exception | None = None
    for cand in candidates:
        kwargs: dict[str, Any] = {
            "model": cand,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0,
            "num_retries": 1,
            "timeout": 60,
        }
        if s.litellm_proxy_url:
            kwargs["api_base"] = s.litellm_proxy_url
            if s.litellm_api_key:
                kwargs["api_key"] = s.litellm_api_key
        for attempt in range(2):
            try:
                resp = await asyncio.to_thread(litellm.completion, **kwargs)
                return resp["choices"][0]["message"]["content"] or ""
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if _is_transient(exc) and attempt == 0:
                    await asyncio.sleep(1.0)
                    continue
                break
    assert last_exc is not None
    raise last_exc


def _extract_json(text: str) -> dict:
    text = (text or "").strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    if not text.startswith("{"):
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            text = m.group(0)
    return json.loads(text)


# ---------- Prompts ----------


SUMMARY_SYS = (
    "You are a careful research assistant. Given a paper's title and abstract "
    "and a user's research question, produce a JSON object with: "
    '{"summary": "2-3 sentence plain-English summary", '
    '"key_findings": ["bullet 1", "bullet 2", ...], '
    '"relevance_score": 0.0-1.0 (how directly the paper answers the question)}. '
    "Reply with strict JSON only — no markdown fence, no commentary."
)

PLANNER_SYS = (
    "You are a research planner. Given the user's question and the papers "
    "summarized so far (with relevance scores), decide whether to keep "
    "searching for more evidence or stop and synthesize. Reply with strict "
    'JSON only: {"action": "continue"|"stop", '
    '"refined_query": "<new arXiv query>", '
    '"reason": "1-sentence justification"}. '
    "Use 'continue' only if a new query would meaningfully improve coverage."
)

SYNTH_SYS = (
    "You are a senior researcher. Write a structured digest answering the "
    "user's question, using ONLY the provided paper summaries. Cite papers "
    "inline using their arXiv id in square brackets, e.g. [2403.12345]. "
    "Structure: a short overall answer, key themes, points of disagreement "
    "(if any), and remaining open questions. Use markdown."
)


# ---------- Per-step helpers ----------


async def _summarize_paper(
    question: str, paper: PaperMetadata
) -> PaperSummary:
    user = (
        f"Research question: {question}\n\n"
        f"Paper title: {paper.title}\n"
        f"Authors: {', '.join(paper.authors[:5])}\n"
        f"Abstract: {paper.abstract}\n"
    )
    try:
        raw = await _llm_chat(system=SUMMARY_SYS, user=user)
        data = _extract_json(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("summarize_paper failed for %s: %s", paper.arxiv_id, exc)
        return PaperSummary(
            arxiv_id=paper.arxiv_id,
            summary=(paper.abstract[:280] + "…") if paper.abstract else "",
            key_findings=[],
            relevance_score=None,
        )
    score = data.get("relevance_score")
    if isinstance(score, (int, float)):
        score = max(0.0, min(1.0, float(score)))
    else:
        score = None
    findings = data.get("key_findings") or []
    if not isinstance(findings, list):
        findings = []
    return PaperSummary(
        arxiv_id=paper.arxiv_id,
        summary=str(data.get("summary") or "").strip(),
        key_findings=[str(x) for x in findings][:6],
        relevance_score=score,
    )


async def _decide_next(
    question: str,
    summaries: list[PaperSummary],
    iteration: int,
    max_iterations: int,
    threshold: int,
) -> dict[str, Any]:
    """Return {"action": "continue"|"stop", "refined_query": str, "reason": str}."""
    relevant = [s for s in summaries if (s.relevance_score or 0) >= 0.5]
    if iteration + 1 >= max_iterations:
        return {
            "action": "stop",
            "refined_query": "",
            "reason": f"reached max iterations ({max_iterations}).",
        }
    if len(relevant) >= threshold:
        return {
            "action": "stop",
            "refined_query": "",
            "reason": f"have {len(relevant)} relevant papers (>= threshold {threshold}).",
        }
    payload = {
        "question": question,
        "iteration": iteration,
        "papers_so_far": [
            {
                "arxiv_id": s.arxiv_id,
                "summary": s.summary,
                "relevance_score": s.relevance_score,
            }
            for s in summaries
        ],
    }
    try:
        raw = await _llm_chat(
            system=PLANNER_SYS, user=json.dumps(payload, default=str)
        )
        data = _extract_json(raw)
    except Exception as exc:  # noqa: BLE001
        logger.warning("planner failed: %s", exc)
        return {
            "action": "stop",
            "refined_query": "",
            "reason": f"planner error: {exc}",
        }
    if data.get("action") not in {"continue", "stop"}:
        data["action"] = "stop"
    data.setdefault("refined_query", "")
    data.setdefault("reason", "")
    return data


async def _synthesize(
    question: str, summaries: list[PaperSummary]
) -> str:
    relevant = [s for s in summaries if (s.relevance_score or 0) >= 0.3]
    if not relevant:
        relevant = summaries
    payload_lines = [f"Question: {question}", "", "Papers:"]
    for s in relevant:
        payload_lines.append(
            f"- [{s.arxiv_id}] (relevance={s.relevance_score}): {s.summary}"
        )
        for f in s.key_findings:
            payload_lines.append(f"    • {f}")
    user = "\n".join(payload_lines)
    try:
        return await _llm_chat(system=SYNTH_SYS, user=user)
    except Exception as exc:  # noqa: BLE001
        logger.exception("synthesis failed")
        return f"_(Synthesis unavailable: {exc})_"


# ---------- Main loop ----------


async def run_agent(request: ResearchRequest) -> AsyncIterator[AgentEvent]:
    s = get_settings()
    max_iter = request.max_iterations or s.agent_max_iterations
    per_iter_results = request.max_results or s.arxiv_max_results
    threshold = s.agent_evidence_threshold

    yield AgentEvent(
        type="thought",
        iteration=0,
        data=f"Starting research on: {request.query!r}. Max iterations={max_iter}, "
        f"evidence threshold={threshold}.",
    )

    seen_ids: set[str] = set()
    all_papers: list[PaperMetadata] = []
    all_summaries: list[PaperSummary] = []
    current_query = request.query

    for iteration in range(max_iter):
        # 1. SEARCH
        yield AgentEvent(
            type="tool_call",
            iteration=iteration,
            data={"tool": "arxiv_search", "query": current_query, "max_results": per_iter_results},
        )
        try:
            papers = await search_arxiv(current_query, max_results=per_iter_results)
        except Exception as exc:  # noqa: BLE001
            yield AgentEvent(
                type="error",
                iteration=iteration,
                data=f"arXiv search failed: {exc}",
            )
            break

        new_papers = [p for p in papers if p.arxiv_id not in seen_ids]
        for p in new_papers:
            seen_ids.add(p.arxiv_id)
            all_papers.append(p)
            yield AgentEvent(
                type="paper_found",
                iteration=iteration,
                data=p.model_dump(mode="json"),
            )

        yield AgentEvent(
            type="tool_result",
            iteration=iteration,
            data={
                "tool": "arxiv_search",
                "returned": len(papers),
                "new": len(new_papers),
                "total_seen": len(all_papers),
            },
        )

        if not new_papers:
            yield AgentEvent(
                type="thought",
                iteration=iteration,
                data="No new papers from this query — stopping search.",
            )
            break

        # 2. SUMMARIZE (in parallel, capped concurrency)
        sem = asyncio.Semaphore(4)

        async def _bounded(p: PaperMetadata) -> PaperSummary:
            async with sem:
                return await _summarize_paper(request.query, p)

        # Run sequentially-yielded but concurrently-executed: gather then yield in order.
        summary_tasks = [asyncio.create_task(_bounded(p)) for p in new_papers]
        for task, paper in zip(summary_tasks, new_papers):
            try:
                summ = await task
            except Exception as exc:  # noqa: BLE001
                logger.warning("summary task failed for %s: %s", paper.arxiv_id, exc)
                continue
            all_summaries.append(summ)
            yield AgentEvent(
                type="paper_summarized",
                iteration=iteration,
                data=summ.model_dump(mode="json"),
            )

        # 3. DECIDE
        decision = await _decide_next(
            request.query, all_summaries, iteration, max_iter, threshold
        )
        yield AgentEvent(
            type="decision",
            iteration=iteration,
            data=decision,
        )

        if decision["action"] == "stop":
            break

        next_q = (decision.get("refined_query") or "").strip()
        if not next_q or next_q == current_query:
            yield AgentEvent(
                type="thought",
                iteration=iteration,
                data="Planner did not suggest a new query — stopping search.",
            )
            break
        current_query = next_q

    # 4. SYNTHESIZE
    yield AgentEvent(
        type="thought",
        iteration=None,
        data=f"Synthesizing digest from {len(all_summaries)} papers.",
    )
    synthesis = await _synthesize(request.query, all_summaries)
    yield AgentEvent(type="synthesis_chunk", data=synthesis)

    # Build citations from key findings (best-effort: 1 quote per top-relevance paper).
    citations: list[Citation] = []
    for summ in sorted(
        all_summaries,
        key=lambda s: (s.relevance_score or 0),
        reverse=True,
    )[:5]:
        if summ.key_findings:
            citations.append(
                Citation(arxiv_id=summ.arxiv_id, quote=summ.key_findings[0])
            )

    digest = ResearchDigest(
        query=request.query,
        papers=all_papers,
        summaries=all_summaries,
        citations=citations,
        synthesis=synthesis,
        generated_at=datetime.utcnow(),
    )
    yield AgentEvent(type="digest", data=digest.model_dump(mode="json"))
    yield AgentEvent(type="done", data={"papers": len(all_papers), "summaries": len(all_summaries)})
