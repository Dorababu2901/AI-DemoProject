"""ChatMessage model — a single message in a thread (user or assistant)."""

from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import ForeignKey, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.thread import Thread


class ChatMessage(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "chat_messages"

    thread_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("threads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # "user" | "assistant" | "system"
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional list of attachment descriptors persisted with the message,
    # e.g. [{"kind": "image", "url": "/api/v1/images/abc.png",
    #        "mime": "image/png", "prompt": "..."}].
    attachments: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSON, nullable=True
    )

    thread: Mapped["Thread"] = relationship(back_populates="messages")
