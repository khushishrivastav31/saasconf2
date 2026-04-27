"""Messaging models for in-platform communication."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    event,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# Known thread-anchor domains. ``conference`` is the legacy default; ``training``
# is added by PR 3 of the training-messaging plan. The DB CHECK constraint
# (migration 213) enforces this at write time.
THREAD_DOMAIN_CONFERENCE = "conference"
THREAD_DOMAIN_TRAINING = "training"
THREAD_DOMAINS = (THREAD_DOMAIN_CONFERENCE, THREAD_DOMAIN_TRAINING)

# ``MessageTemplate.category`` discriminator. Conference templates use
# CFP-applicant placeholders; training templates use training-attendee
# placeholders. Migration 215 adds the column and the CHECK constraint.
TEMPLATE_CATEGORY_CONFERENCE = "conference"
TEMPLATE_CATEGORY_TRAINING = "training"
TEMPLATE_CATEGORIES = (TEMPLATE_CATEGORY_CONFERENCE, TEMPLATE_CATEGORY_TRAINING)


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
    # Discriminator added in migration 215 — ``conference`` (the legacy
    # default for every existing row) or ``training``. The trainings
    # module only ever shows / writes ``training`` templates so the two
    # admin surfaces don't bleed into each other's pickers.
    category: Mapped[str] = mapped_column(String(20), nullable=False, default=TEMPLATE_CATEGORY_CONFERENCE)
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
        CheckConstraint(
            f"category IN ({', '.join(repr(c) for c in TEMPLATE_CATEGORIES)})",
            name="ck_message_templates_category",
        ),
        UniqueConstraint("tenant_id", "name", name="uq_message_templates_tenant_name"),
        Index("idx_message_templates_tenant", "tenant_id"),
        Index("idx_message_templates_tenant_category", "tenant_id", "category"),
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


class DynamicRecipientList(Base):
    """A saved dynamic filter for recipient resolution, scoped to conference."""

    __tablename__ = "dynamic_recipient_lists"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "registration" | "sponsor"
    filters: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "conference_id", "name", name="uq_dynamic_recipient_lists_name"),
        Index("idx_dynamic_recipient_lists_tenant", "tenant_id"),
        Index("idx_dynamic_recipient_lists_conference", "conference_id"),
    )


class MessageThread(Base):
    """A conversation thread between tenant admins and applicants."""

    __tablename__ = "message_threads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    # Nullable as of migration 214: training-domain threads anchor on
    # ``TrainingRegistration`` and leave this column NULL.
    #
    # The ``Mapped[UUID]`` annotation deliberately omits ``| None`` even
    # though the DB column is nullable. Reasoning: every conference-domain
    # code path queries by ``MessageThread.conference_id == X`` first and
    # therefore reads ``.conference_id`` only for rows where the value is
    # non-null. Training-domain code reads ``.domain_entity_id`` instead.
    # The one place that aggregates *all* threads (``global_unread.py``)
    # filters by ``domain == 'conference'`` to keep the invariant.
    #
    # If a future caller crosses domains, narrow with an ``assert
    # thread.conference_id is not None`` rather than weakening this type.
    conference_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conferences.id", ondelete="CASCADE"), nullable=True
    )
    # Generic anchor: pairs with ``conference_id`` for conference threads, or
    # holds the ``TrainingRegistration.id`` for training threads. The
    # ``before_insert`` listener below mirrors ``conference_id`` into
    # ``domain_entity_id`` so existing conference-domain constructors keep
    # working unchanged.
    domain: Mapped[str] = mapped_column(String(20), nullable=False, default=THREAD_DOMAIN_CONFERENCE)
    domain_entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
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
        CheckConstraint(
            f"domain IN ({', '.join(repr(d) for d in THREAD_DOMAINS)})",
            name="ck_message_threads_domain",
        ),
        Index("idx_message_threads_tenant", "tenant_id"),
        Index("idx_message_threads_conference", "tenant_id", "conference_id"),
        Index("idx_message_threads_domain_entity", "tenant_id", "domain", "domain_entity_id"),
    )


@event.listens_for(MessageThread, "before_insert")
def _mirror_conference_id_to_domain_entity(mapper, connection, target: "MessageThread") -> None:
    """Default the generic anchor to the legacy ``conference_id`` at insert.

    Lets every existing conference-domain ``MessageThread(...)`` constructor
    keep working without explicitly setting ``domain`` / ``domain_entity_id``.

    Only mirrors when domain is the conference default — training-domain
    callers MUST set ``domain_entity_id`` explicitly. If they forget, the
    NOT NULL constraint rejects the insert (loud failure rather than a
    silent point-at-the-wrong-thing bug).
    """
    if not target.domain:
        target.domain = THREAD_DOMAIN_CONFERENCE
    if (
        target.domain == THREAD_DOMAIN_CONFERENCE
        and target.domain_entity_id is None
        and target.conference_id is not None
    ):
        target.domain_entity_id = target.conference_id


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
