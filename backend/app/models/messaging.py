"""Messaging models for in-platform communication."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MessageTemplate(Base):
    """Reusable message template scoped to a tenant."""

    __tablename__ = "message_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    screen_overlay_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("screen_overlays.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    screen_overlay: Mapped["ScreenOverlay | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "ScreenOverlay", lazy="selectin"
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_message_templates_tenant_name"),
        Index("idx_message_templates_tenant", "tenant_id"),
    )


class RecipientList(Base):
    """Named list of applicants for bulk messaging, scoped to tenant."""

    __tablename__ = "recipient_lists"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    members: Mapped[list["RecipientListMember"]] = relationship(
        "RecipientListMember", back_populates="recipient_list", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_recipient_lists_tenant_name"),
        Index("idx_recipient_lists_tenant", "tenant_id"),
    )


class RecipientListMember(Base):
    """A member (applicant) in a recipient list."""

    __tablename__ = "recipient_list_members"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recipient_lists.id", ondelete="CASCADE"), nullable=False
    )
    applicant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    recipient_list: Mapped["RecipientList"] = relationship("RecipientList", back_populates="members")

    __table_args__ = (
        UniqueConstraint("list_id", "applicant_id", name="uq_recipient_list_members_list_applicant"),
        Index("idx_recipient_list_members_list", "list_id"),
    )


class MessageThread(Base):
    """A conversation thread between tenant admins and applicants."""

    __tablename__ = "message_threads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    bulk_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    has_attachments: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    screen_overlay_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("screen_overlays.id", ondelete="SET NULL"), nullable=True
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    screen_overlay: Mapped["ScreenOverlay | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "ScreenOverlay", lazy="selectin"
    )
    participants: Mapped[list["MessageParticipant"]] = relationship(
        "MessageParticipant", back_populates="thread", cascade="all, delete-orphan"
    )
    messages: Mapped[list["Message"]] = relationship("Message", back_populates="thread", cascade="all, delete-orphan")
    flags: Mapped[list["ThreadFlag"]] = relationship(
        "ThreadFlag", back_populates="thread", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_message_threads_tenant", "tenant_id"),
        Index("idx_message_threads_conference", "tenant_id", "conference_id"),
    )


class MessageParticipant(Base):
    """Links a user or applicant to a message thread."""

    __tablename__ = "message_participants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("message_threads.id", ondelete="CASCADE"), nullable=False
    )
    participant_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" or "applicant"
    participant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    thread: Mapped["MessageThread"] = relationship("MessageThread", back_populates="participants")

    __table_args__ = (
        UniqueConstraint(
            "thread_id",
            "participant_type",
            "participant_id",
            name="uq_message_participants_thread_entity",
        ),
        Index("idx_message_participants_thread", "thread_id"),
        Index("idx_message_participants_lookup", "participant_type", "participant_id"),
    )


class Message(Base):
    """An individual message within a thread."""

    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("message_threads.id", ondelete="CASCADE"), nullable=False
    )
    sender_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" or "applicant"
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal_note: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    thread: Mapped["MessageThread"] = relationship("MessageThread", back_populates="messages")

    __table_args__ = (
        Index("idx_messages_thread", "thread_id"),
        Index("idx_messages_thread_created", "thread_id", "created_at"),
    )


class ThreadFlag(Base):
    """Per-user flag/star on a message thread."""

    __tablename__ = "thread_flags"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("message_threads.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    thread: Mapped["MessageThread"] = relationship("MessageThread", back_populates="flags")

    __table_args__ = (
        UniqueConstraint("thread_id", "user_id", name="uq_thread_flags_thread_user"),
        Index("idx_thread_flags_thread", "thread_id"),
        Index("idx_thread_flags_user", "user_id"),
    )
