"""Chat routes — calls the configured LLM via LiteLLM."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from app.ai.llm import generate_reply
from app.core.config import get_settings
from app.schemas.chat import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/send", response_model=ChatResponse)
async def send_message(payload: ChatRequest) -> ChatResponse:
    settings = get_settings()
    try:
        reply = await generate_reply(payload.message, payload.history)
    except Exception as exc:  # noqa: BLE001 — surface as 502 to the client
        logger.exception("LLM call failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM call failed: {exc}",
        ) from exc

    return ChatResponse(reply=reply, model=settings.default_llm_model)
