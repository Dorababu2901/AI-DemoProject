"""Natural-language → SQL using LiteLLM (reuses DemoApp's LLM gateway)."""
from __future__ import annotations

import json
import os
import re
import time
from typing import Optional, Protocol

import litellm

# Suppress LiteLLM's noisy "Give Feedback / Get Help" banner that prints to
# stderr on every handled exception (we already log + fall back ourselves).
litellm.suppress_debug_info = True

from app.core.config import get_settings

from ..schemas import ChartHint, SchemaOut
from .introspect import schema_prompt

SQL_SYSTEM_PROMPT = """You are an expert data analyst that writes safe, correct,
read-only SQL for the user's database. Rules:
- Output ONLY a single SELECT (CTEs allowed).
- Never INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/CREATE.
- Use the exact table & column names provided in the schema.
- Prefer explicit JOINs and column lists over SELECT *.
- Add a LIMIT (<= {limit}) when the result could be large.
- Use the database's dialect: {dialect}.
- Reply as strict JSON: {{"sql": "...", "chart": {{"type": "bar|line|pie|none", "x": "col?", "y": "col?"}}}}.
"""


class _ChatFn(Protocol):
    def __call__(self, *, system: str, user: str) -> str: ...


def _ensure_provider_env() -> None:
    """Mirror provider keys from settings into os.environ for LiteLLM."""
    s = get_settings()
    pairs = {
        "OPENAI_API_KEY": s.openai_api_key,
        "ANTHROPIC_API_KEY": s.anthropic_api_key,
        "GOOGLE_API_KEY": s.google_api_key,
    }
    for key, value in pairs.items():
        if value and not os.environ.get(key):
            os.environ[key] = value


def _is_transient(exc: Exception) -> bool:
    msg = str(exc).lower()
    return (
        "internal server error" in msg
        or "internalservererror" in msg
        or "503" in msg
        or "504" in msg
        or "timeout" in msg
        or "timed out" in msg
        or "rate limit" in msg
        or "overloaded" in msg
        or "service unavailable" in msg
    )


def _try_model(model: str, *, system: str, user: str, attempts: int = 3) -> str:
    """Call one model with retries on transient failures. Raises on permanent failure."""
    s = get_settings()
    kwargs: dict = {
        "model": model,
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

    last_exc: Exception | None = None
    for attempt in range(attempts):
        try:
            resp = litellm.completion(**kwargs)
            return resp["choices"][0]["message"]["content"] or ""
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            if not _is_transient(exc) or attempt == attempts - 1:
                break
            time.sleep(1.5 * (attempt + 1))
    assert last_exc is not None
    raise last_exc


def _litellm_chat(*, system: str, user: str) -> str:
    """Try the primary model, then each fallback in order on transient/auth failures."""
    s = get_settings()
    _ensure_provider_env()

    candidates = [s.default_llm_model, *s.llm_fallback_models_list]
    errors: list[str] = []
    for model in candidates:
        try:
            return _try_model(model, system=system, user=user)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{model}: {type(exc).__name__}: {str(exc)[:200]}")
            # Permanent BadRequest (e.g. "model not allowed") → just move on to next fallback.
            continue

    raise RuntimeError(
        "All LLM models failed. Tried:\n" + "\n".join(f"  - {e}" for e in errors)
    )


# Public hook — tests override this.
LLM: _ChatFn = _litellm_chat


def _extract_json(text: str) -> dict:
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    if not text.startswith("{"):
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            text = m.group(0)
    return json.loads(text)


def generate_sql(
    *, question: str, schema: SchemaOut, history: Optional[list[dict[str, str]]] = None,
    default_limit: int = 100,
) -> tuple[str, ChartHint]:
    sys = SQL_SYSTEM_PROMPT.format(limit=default_limit, dialect=schema.dialect)
    parts = [schema_prompt(schema), ""]
    if history:
        parts.append("Conversation so far:")
        for m in history[-6:]:
            parts.append(f"- {m.get('role','user')}: {m.get('content','')}")
        parts.append("")
    parts.append(f"User question: {question}")
    user = "\n".join(parts)

    raw = LLM(system=sys, user=user)
    try:
        data = _extract_json(raw)
    except Exception as e:
        raise ValueError(f"LLM did not return valid JSON: {raw[:300]}") from e

    sql = (data.get("sql") or "").strip()
    if not sql:
        raise ValueError("LLM returned empty SQL.")

    chart_data = data.get("chart") or {}
    ctype = chart_data.get("type", "none")
    if ctype not in {"bar", "line", "pie", "none"}:
        ctype = "none"
    chart = ChartHint(type=ctype, x=chart_data.get("x"), y=chart_data.get("y"))
    return sql, chart


def explain_result(*, question: Optional[str], sql: str, columns: list[str], rows: list[list]) -> str:
    sys = (
        "You are a data analyst. Given a SQL query and its result rows, "
        "write a concise (1-3 sentence) plain-English summary of what the result shows."
    )
    sample = rows[:20]
    user = (
        (f"Question: {question}\n" if question else "")
        + f"SQL:\n{sql}\n\nColumns: {columns}\n"
        + f"Rows (first {len(sample)} of {len(rows)}): {sample}"
    )
    try:
        return LLM(system=sys, user=user).strip()
    except Exception as e:
        return f"(explanation unavailable: {e})"
