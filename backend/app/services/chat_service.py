"""Chat storage & retrieval business logic.

All access is scoped by `user_id` so a user can never read or modify another
user's threads. Thread + message fetches eager-load relationships with
`selectinload` to prevent N+1 queries.
"""

from __future__ import annotations

import re
from typing import Sequence
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.chat_message import ChatMessage
from app.models.thread import Thread


# Lightweight heuristic for "please draw / generate an image" requests.
_IMAGE_INTENT_RE = re.compile(
    r"\b("
    r"draw|sketch|paint|illustrate|render|generate|create|make|show|design"
    r")\b[^.?!]{0,80}\b("
    r"image|picture|photo|illustration|drawing|painting|art|logo|icon|wallpaper|render|scene"
    r")\b",
    re.IGNORECASE,
)
_IMAGE_PREFIX_RE = re.compile(
    r"^\s*(draw|sketch|paint|illustrate|render|imagine|generate an image of)\b",
    re.IGNORECASE,
)


def is_image_request(message: str) -> bool:
    """Heuristic: True if the user is asking for image generation."""
    if not message:
        return False
    if _IMAGE_PREFIX_RE.search(message):
        return True
    return bool(_IMAGE_INTENT_RE.search(message))


# --------------------------------------------------------------------------- #
# Threads                                                                      #
# --------------------------------------------------------------------------- #
def list_threads(db: Session, *, user_id: UUID) -> Sequence[Thread]:
    """Return all of a user's threads, newest first. No messages loaded."""
    stmt = (
        select(Thread)
        .where(Thread.user_id == user_id)
        .order_by(Thread.updated_at.desc())
    )
    return db.scalars(stmt).all()


def get_thread(
    db: Session,
    *,
    thread_id: UUID,
    user_id: UUID,
    with_messages: bool = False,
) -> Thread:
    """Fetch a single thread (optionally with all messages eager-loaded).

    Uses `selectinload` so messages come back in one extra query rather
    than triggering an N+1 lazy-load when serializing the response.
    """
    stmt = select(Thread).where(Thread.id == thread_id, Thread.user_id == user_id)
    if with_messages:
        stmt = stmt.options(selectinload(Thread.messages))
    thread = db.scalar(stmt)
    if thread is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thread not found",
        )
    return thread


def create_thread(db: Session, *, user_id: UUID, title: str | None = None) -> Thread:
    thread = Thread(user_id=user_id, title=title)
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def update_thread(
    db: Session,
    *,
    thread_id: UUID,
    user_id: UUID,
    title: str | None,
) -> Thread:
    thread = get_thread(db, thread_id=thread_id, user_id=user_id)
    thread.title = title
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def delete_thread(db: Session, *, thread_id: UUID, user_id: UUID) -> None:
    thread = get_thread(db, thread_id=thread_id, user_id=user_id)
    db.delete(thread)
    db.commit()


# --------------------------------------------------------------------------- #
# Messages                                                                     #
# --------------------------------------------------------------------------- #
def list_messages(
    db: Session,
    *,
    thread_id: UUID,
    user_id: UUID,
) -> Sequence[ChatMessage]:
    """Return ordered messages for a thread, after verifying ownership."""
    # Ownership check (cheap PK lookup, no joins).
    get_thread(db, thread_id=thread_id, user_id=user_id)
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread_id)
        .order_by(ChatMessage.created_at.asc())
    )
    return db.scalars(stmt).all()


def add_message(
    db: Session,
    *,
    thread_id: UUID,
    user_id: UUID,
    role: str,
    content: str,
    attachments: list[dict] | None = None,
    commit: bool = True,
) -> ChatMessage:
    """Append a single message to a thread (after ownership check)."""
    get_thread(db, thread_id=thread_id, user_id=user_id)
    message = ChatMessage(
        thread_id=thread_id,
        role=role,
        content=content,
        attachments=attachments,
    )
    db.add(message)
    if commit:
        db.commit()
        db.refresh(message)
    return message


def get_thread_memory(
    db: Session,
    *,
    thread_id: UUID,
    user_id: UUID,
    limit: int | None = 50,
) -> list[dict[str, str]]:
    """Return the last `limit` messages formatted for the LLM (role/content).

    Used by the chat send endpoint to build conversational context.
    """
    get_thread(db, thread_id=thread_id, user_id=user_id)
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread_id)
        .order_by(ChatMessage.created_at.desc())
    )
    if limit:
        stmt = stmt.limit(limit)
    rows = list(db.scalars(stmt).all())
    rows.reverse()  # chronological order for the LLM
    return [{"role": m.role, "content": m.content} for m in rows]
