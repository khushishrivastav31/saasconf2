"""Messaging models for in-platform communication."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MessageThread(Base):
    """A conversation thread between tenant admins and applicants."""

    __tablename__ = "message_threads"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    bulk_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    participants: Mapped[list["MessageParticipant"]] = relationship(
        "MessageParticipant", back_populates="thread", cascade="all, delete-orphan"
    )
    messages: Mapped[list["Message"]] = relationship(
        "Message", back_populates="thread", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_message_threads_tenant", "tenant_id"),
        Index("idx_message_threads_conference", "tenant_id", "conference_id"),
    )


class MessageParticipant(Base):
    """Links a user or applicant to a message thread."""

    __tablename__ = "message_participants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("message_threads.id", ondelete="CASCADE"), nullable=False
    )
    participant_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" or "applicant"
    participant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    last_read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    thread: Mapped["MessageThread"] = relationship(
        "MessageThread", back_populates="participants"
    )

    __table_args__ = (
        UniqueConstraint(
            "thread_id", "participant_type", "participant_id",
            name="uq_message_participants_thread_entity",
        ),
        Index("idx_message_participants_thread", "thread_id"),
        Index("idx_message_participants_lookup", "participant_type", "participant_id"),
    )


class Message(Base):
    """An individual message within a thread."""

    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("message_threads.id", ondelete="CASCADE"), nullable=False
    )
    sender_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" or "applicant"
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    thread: Mapped["MessageThread"] = relationship(
        "MessageThread", back_populates="messages"
    )

    __table_args__ = (
        Index("idx_messages_thread", "thread_id"),
        Index("idx_messages_thread_created", "thread_id", "created_at"),
    )
