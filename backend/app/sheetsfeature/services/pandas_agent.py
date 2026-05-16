"""Wrap LangChain's pandas DataFrame agent around our LiteLLM gateway."""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import pandas as pd
from langchain_experimental.agents import create_pandas_dataframe_agent
from langchain_openai import ChatOpenAI

from app.core.config import get_settings

logger = logging.getLogger(__name__)


# ---------- LLM construction (LiteLLM proxy speaks the OpenAI protocol) ----------


def _ensure_provider_env() -> None:
    """Mirror provider keys from settings into os.environ (for direct calls)."""
    s = get_settings()
    pairs = {
        "OPENAI_API_KEY": s.openai_api_key,
        "ANTHROPIC_API_KEY": s.anthropic_api_key,
        "GOOGLE_API_KEY": s.google_api_key,
    }
    for k, v in pairs.items():
        if v and not os.environ.get(k):
            os.environ[k] = v


def _build_llm(model: str) -> ChatOpenAI:
    s = get_settings()
    _ensure_provider_env()
    kwargs: dict[str, Any] = {
        "model": model,
        "temperature": 0,
        "timeout": 60,
        "max_retries": 1,
    }
    if s.litellm_proxy_url:
        kwargs["base_url"] = s.litellm_proxy_url.rstrip("/") + "/v1"
        kwargs["api_key"] = s.litellm_api_key or "sk-proxy"
    elif s.openai_api_key:
        kwargs["api_key"] = s.openai_api_key
    return ChatOpenAI(**kwargs)


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


# ---------- Agent ----------


SYSTEM_PREFIX = (
    "You are a careful data analyst working with a Pandas DataFrame named `df`. "
    "Use python_repl_ast to compute the answer. "
    "Prefer concise answers; when returning tables use `to_dict(orient='records')`. "
    "Never modify or persist the DataFrame; read-only analysis only."
)


def _run_with_model(model: str, df: pd.DataFrame, question: str) -> dict[str, Any]:
    llm = _build_llm(model)
    s = get_settings()
    agent = create_pandas_dataframe_agent(
        llm,
        df,
        verbose=False,
        allow_dangerous_code=True,
        agent_type="tool-calling",
        max_iterations=s.sheets_agent_max_iterations,
        handle_parsing_errors=True,
        return_intermediate_steps=True,
        prefix=SYSTEM_PREFIX,
    )
    result = agent.invoke({"input": question})
    return result


def ask_dataframe(df: pd.DataFrame, question: str) -> dict[str, Any]:
    """Try primary model, fall back to LLM_FALLBACK_MODELS on transient failure."""
    s = get_settings()
    candidates = [s.default_llm_model, *s.llm_fallback_models_list]
    errors: list[str] = []
    last_exc: Exception | None = None

    for model in candidates:
        for attempt in range(2):
            try:
                raw = _run_with_model(model, df, question)
                return _normalize_result(raw)
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if _is_transient(exc) and attempt == 0:
                    time.sleep(1.0)
                    continue
                errors.append(f"{model}: {type(exc).__name__}: {str(exc)[:200]}")
                break

    assert last_exc is not None
    raise RuntimeError(
        "All LLM models failed for pandas agent. Tried:\n"
        + "\n".join(f"  - {e}" for e in errors)
    ) from last_exc


def _normalize_result(raw: dict[str, Any]) -> dict[str, Any]:
    answer = str(raw.get("output", "")).strip()
    code: str | None = None
    steps = raw.get("intermediate_steps") or []
    # Last python_repl_ast tool call → grab its input as "code"
    for action, _obs in reversed(steps):
        try:
            tool = getattr(action, "tool", None)
            tool_input = getattr(action, "tool_input", None)
            if tool in {"python_repl_ast", "PythonAstREPLTool"} and tool_input:
                if isinstance(tool_input, dict):
                    code = str(tool_input.get("query") or tool_input.get("code") or "")
                else:
                    code = str(tool_input)
                if code:
                    break
        except Exception:
            continue
    return {"answer": answer, "code": code}
