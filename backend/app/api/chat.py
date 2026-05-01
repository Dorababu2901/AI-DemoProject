"""Chat send endpoint — persists messages, builds memory, calls the LLM."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai.llm import generate_reply
from app.api.deps import CurrentUser
from app.core.config import get_settings
from app.db.session import get_db
from app.schemas.chat import ChatRequest, ChatResponse, ChatTurn
from app.services import chat_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])

DbSession = Annotated[Session, Depends(get_db)]


@router.post("/send", response_model=ChatResponse)
async def send_message(
    payload: ChatRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> ChatResponse:
    settings = get_settings()

    # 1. Resolve or create the thread (scoped to current user).
    if payload.thread_id is not None:
        thread = chat_service.get_thread(
            db, thread_id=payload.thread_id, user_id=current_user.id
        )
    else:
        title = payload.message[:60]
        thread = chat_service.create_thread(
            db, user_id=current_user.id, title=title
        )

    # 2. Persist the user message FIRST so it's saved even if the LLM fails.
    user_msg = chat_service.add_message(
        db,
        thread_id=thread.id,
        user_id=current_user.id,
        role="user",
        content=payload.message,
    )

    # 3. Build conversational memory from the DB (preferred over client history).
    memory = chat_service.get_thread_memory(
        db, thread_id=thread.id, user_id=current_user.id, limit=50
    )
    # The just-saved user turn is already the last entry in memory; strip it
    # since `generate_reply` will append it again from `user_message`.
    if memory and memory[-1]["role"] == "user":
        memory = memory[:-1]

    history = [ChatTurn(role=m["role"], content=m["content"]) for m in memory]

    # 4. Call the LLM.
    try:
        reply = await generate_reply(payload.message, history)
    except Exception as exc:  # noqa: BLE001 — surface as 502 to the client
        logger.exception("LLM call failed for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM call failed: {exc}",
        ) from exc

    # 5. Persist the assistant message.
    assistant_msg = chat_service.add_message(
        db,
        thread_id=thread.id,
        user_id=current_user.id,
        role="assistant",
        content=reply,
    )

    return ChatResponse(
        reply=reply,
        model=settings.default_llm_model,
        thread_id=thread.id,
        user_message_id=user_msg.id,
        assistant_message_id=assistant_msg.id,
    )
