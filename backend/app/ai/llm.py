"""LLM client wrapper using LiteLLM.

LiteLLM provides a single `acompletion` API that routes to OpenAI, Anthropic,
Google, Azure, Ollama, and many other providers based on the `model` string.
Provider credentials are read from environment variables (e.g., OPENAI_API_KEY).
"""

from __future__ import annotations

import os
from typing import Iterable

import litellm

from app.core.config import get_settings
from app.schemas.chat import ChatTurn


def _ensure_provider_env() -> None:
    """Mirror provider keys from settings into os.environ for LiteLLM."""
    settings = get_settings()
    pairs = {
        "OPENAI_API_KEY": settings.openai_api_key,
        "ANTHROPIC_API_KEY": settings.anthropic_api_key,
        "GOOGLE_API_KEY": settings.google_api_key,
    }
    for key, value in pairs.items():
        if value and not os.environ.get(key):
            os.environ[key] = value


def _build_messages(history: Iterable[ChatTurn], user_message: str) -> list[dict]:
    settings = get_settings()
    messages: list[dict] = [
        {"role": "system", "content": settings.llm_system_prompt}
    ]
    for turn in history:
        if turn.role in ("user", "assistant"):
            messages.append({"role": turn.role, "content": turn.content})
    messages.append({"role": "user", "content": user_message})
    return messages


async def generate_reply(
    user_message: str,
    history: Iterable[ChatTurn] = (),
) -> str:
    """Call the configured LLM and return the assistant reply text."""
    _ensure_provider_env()
    settings = get_settings()

    model = settings.default_llm_model
    kwargs: dict = {
        "messages": _build_messages(history, user_message),
        "temperature": settings.llm_temperature,
        "max_tokens": settings.llm_max_tokens,
    }
    # Route through a self-hosted LiteLLM proxy if configured.
    # The proxy exposes an OpenAI-compatible /chat/completions endpoint, so we
    # force the OpenAI provider and target the proxy as the api_base.
    if settings.litellm_proxy_url:
        if not model.startswith("openai/"):
            model = f"openai/{model}"
        kwargs["api_base"] = settings.litellm_proxy_url.rstrip("/")
        kwargs["api_key"] = settings.litellm_api_key or "sk-proxy"

    kwargs["model"] = model
    response = await litellm.acompletion(**kwargs)
    # LiteLLM normalizes responses to OpenAI's chat-completion shape.
    return response["choices"][0]["message"]["content"] or ""
