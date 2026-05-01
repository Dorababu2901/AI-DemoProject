"""Pydantic schemas for chat threads and messages."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal["user", "assistant", "system"]


# --------------------------------------------------------------------------- #
# Existing send-message schema (kept for the LLM endpoint).                    #
# --------------------------------------------------------------------------- #
class ChatTurn(BaseModel):
    role: Role
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    history: list[ChatTurn] = Field(default_factory=list)
    thread_id: UUID | None = None


class ChatResponse(BaseModel):
    reply: str
    model: str
    thread_id: UUID
    user_message_id: UUID
    assistant_message_id: UUID


# --------------------------------------------------------------------------- #
# Storage schemas                                                              #
# --------------------------------------------------------------------------- #
class ChatMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    thread_id: UUID
    role: Role
    content: str
    created_at: datetime


class ThreadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str | None
    created_at: datetime
    updated_at: datetime


class ThreadWithMessages(ThreadRead):
    messages: list[ChatMessageRead] = Field(default_factory=list)


class ThreadCreate(BaseModel):
    title: str | None = Field(default=None, max_length=255)


class ThreadUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)

    @field_validator("title")
    @classmethod
    def _strip_or_reject(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("title must not be empty or whitespace")
        return stripped


class MessageCreate(BaseModel):
    role: Role = "user"
    content: str = Field(..., min_length=1, max_length=8000)
