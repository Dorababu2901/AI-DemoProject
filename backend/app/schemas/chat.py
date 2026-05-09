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


# --------------------------------------------------------------------------- #
# Attachments — multi-format inputs from the chat UI.                          #
# --------------------------------------------------------------------------- #
AttachmentKind = Literal["image", "video", "table", "formula", "code", "file"]


class ChatAttachment(BaseModel):
    """One attachment from the UI.

    - `kind` drives how the backend renders it into the LLM prompt.
    - For images: `data` is a data URL (data:image/png;base64,...) used directly
      by vision-capable models (Gemini, GPT-4o, Claude).
    - For text-like attachments (table / formula / code / file): `text` carries
      the raw content which is inlined into the user prompt.
    - `name` and `mime` are optional metadata used for labeling.
    """

    kind: AttachmentKind
    name: str | None = Field(default=None, max_length=255)
    mime: str | None = Field(default=None, max_length=100)
    text: str | None = Field(default=None, max_length=200_000)
    data: str | None = Field(default=None, max_length=15_000_000)
    language: str | None = Field(default=None, max_length=40)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)
    history: list[ChatTurn] = Field(default_factory=list)
    thread_id: UUID | None = None
    attachments: list[ChatAttachment] = Field(default_factory=list, max_length=10)
    # When False, the backend skips ChromaDB retrieval even if PDFs are indexed.
    rag_enabled: bool = True


class ChatResponse(BaseModel):
    reply: str
    model: str
    thread_id: UUID
    user_message_id: UUID
    assistant_message_id: UUID
    attachments: list[dict] = Field(default_factory=list)


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
    attachments: list[dict] | None = None


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
