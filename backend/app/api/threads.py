"""Thread CRUD + message retrieval routes."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser
from app.db.session import get_db
from app.schemas.chat import (
    ChatMessageRead,
    MessageCreate,
    ThreadCreate,
    ThreadRead,
    ThreadUpdate,
    ThreadWithMessages,
)
from app.services import chat_service

router = APIRouter(prefix="/threads", tags=["threads"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[ThreadRead])
def list_my_threads(current_user: CurrentUser, db: DbSession) -> list:
    return list(chat_service.list_threads(db, user_id=current_user.id))


@router.post("", response_model=ThreadRead, status_code=status.HTTP_201_CREATED)
def create_my_thread(
    payload: ThreadCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    return chat_service.create_thread(
        db, user_id=current_user.id, title=payload.title
    )


@router.get("/{thread_id}", response_model=ThreadWithMessages)
def get_my_thread(
    thread_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
):
    # `selectinload` eager-fetches messages in one query (no N+1).
    return chat_service.get_thread(
        db, thread_id=thread_id, user_id=current_user.id, with_messages=True
    )


@router.patch("/{thread_id}", response_model=ThreadRead)
def update_my_thread(
    thread_id: UUID,
    payload: ThreadUpdate,
    current_user: CurrentUser,
    db: DbSession,
):
    return chat_service.update_thread(
        db, thread_id=thread_id, user_id=current_user.id, title=payload.title
    )


@router.delete("/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_thread(
    thread_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    chat_service.delete_thread(db, thread_id=thread_id, user_id=current_user.id)


@router.get("/{thread_id}/messages", response_model=list[ChatMessageRead])
def list_thread_messages(
    thread_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> list:
    return list(
        chat_service.list_messages(
            db, thread_id=thread_id, user_id=current_user.id
        )
    )


@router.post(
    "/{thread_id}/messages",
    response_model=ChatMessageRead,
    status_code=status.HTTP_201_CREATED,
)
def append_thread_message(
    thread_id: UUID,
    payload: MessageCreate,
    current_user: CurrentUser,
    db: DbSession,
):
    return chat_service.add_message(
        db,
        thread_id=thread_id,
        user_id=current_user.id,
        role=payload.role,
        content=payload.content,
    )
