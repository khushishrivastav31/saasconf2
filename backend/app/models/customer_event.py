"""Customer event — unified append-only log of everything that happens to a customer.

A tenant's ``PortalUser`` is the canonical "customer" concept. Every action
that touches them — admin actions (toggle access, invite, password reset,
impersonate, merge), training lifecycle (registered, parked, reassigned,
cancelled, ...), and eventually CFP transitions and messaging — emits one
row here via :class:`CustomerEventService`.

Design notes (see ``.claude/plans/smooth-sprouting-perlis.md``):

* ``portal_user_id`` is nullable (``SET NULL`` on delete) so that merging
  two portal users (which deletes the source row) does not cascade-zap
  the history. ``subject_email_hash`` is always set and is the stable
  lookup key across merges/deletes.
* ``event_type`` values are namespaced strings of the form
  ``<domain>.<action>`` (``portal.activated``, ``training.registered``,
  ``cfp.submitted``, ``messaging.received``, ...). The
  :class:`CustomerEventType` ``StrEnum`` is the single source of truth;
  the service layer rejects anything else.
* ``related_entity_type`` + ``related_entity_id`` form a polymorphic
  pointer back to the domain object (``training_attendee``,
  ``cfp_paper``, ``message_thread``, ...). These stay loosely-typed so
  messaging + CFP can plug in later with no migration.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.portal_user import PortalUser


# ── Event-type enum ─────────────────────────────────────────────────────


class CustomerEventType(StrEnum):
    """Authoritative list of customer-event types.

    All values are namespaced as ``<domain>.<action>``. The
    :class:`CustomerEventService` rejects any write whose ``event_type``
    prefix does not match its ``domain`` argument.

    Adding a new event type:
      1. Add the member here (keep the prefix consistent with its domain).
      2. Add a UI label + colour in
         ``frontend/src/pages/MyCompany/UsersTab/constants.ts``.
      3. Add a test in ``tests/test_customer_events.py``.
    """

    # ── portal.* ─ admin actions on the portal user itself ──────────────
    PORTAL_ACTIVATED = "portal.activated"
    PORTAL_DEACTIVATED = "portal.deactivated"
    PORTAL_INVITE_RESENT = "portal.invite_resent"
    PORTAL_PASSWORD_RESET_SENT = "portal.password_reset_sent"
    PORTAL_IMPERSONATED = "portal.impersonated"
    PORTAL_MERGED_FROM = "portal.merged_from"
    PORTAL_MERGED_INTO = "portal.merged_into"

    # ── training.* ─ training attendee lifecycle ────────────────────────
    TRAINING_REGISTERED = "training.registered"
    TRAINING_OFFER_ASSIGNED = "training.offer_assigned"
    TRAINING_PARKED = "training.parked"
    TRAINING_REASSIGNED = "training.reassigned"
    TRAINING_CANCELLED = "training.cancelled"
    TRAINING_OFFER_REMOVED = "training.offer_removed"
    TRAINING_DEACTIVATED = "training.deactivated"
    TRAINING_REACTIVATED = "training.reactivated"

    # ── cfp.* / registration.* / messaging.* / billing.* ────────────────
    # Reserved for forward-compat. Writers will be wired in follow-up PRs.


DOMAIN_PORTAL = "portal"
DOMAIN_TRAINING = "training"
DOMAIN_CFP = "cfp"
DOMAIN_REGISTRATION = "registration"
DOMAIN_MESSAGING = "messaging"
DOMAIN_BILLING = "billing"

VALID_DOMAINS: frozenset[str] = frozenset(
    {DOMAIN_PORTAL, DOMAIN_TRAINING, DOMAIN_CFP, DOMAIN_REGISTRATION, DOMAIN_MESSAGING, DOMAIN_BILLING}
)

# Actor categories — who performed the action.
ACTOR_ADMIN = "admin"
ACTOR_SYSTEM = "system"
ACTOR_PORTAL_USER = "portal_user"
ACTOR_ATTENDEE = "attendee"

VALID_ACTOR_KINDS: frozenset[str] = frozenset({ACTOR_ADMIN, ACTOR_SYSTEM, ACTOR_PORTAL_USER, ACTOR_ATTENDEE})


# ── Model ───────────────────────────────────────────────────────────────


class CustomerEvent(Base):
    """Single append-only row per customer interaction."""

    __tablename__ = "customer_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    # Nullable so a merged/deleted portal user's history survives via email_hash.
    portal_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("portal_users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Always set — stable lookup key across merges/deletes.
    subject_email_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    domain: Mapped[str] = mapped_column(String(20), nullable=False)
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)

    actor_kind: Mapped[str] = mapped_column(String(16), nullable=False, default=ACTOR_SYSTEM)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)

    related_entity_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    related_entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    portal_user: Mapped[PortalUser | None] = relationship("PortalUser", back_populates="customer_events")

    __table_args__ = (
        Index("idx_customer_events_user_created", "portal_user_id", "created_at"),
        Index("idx_customer_events_email_hash_created", "tenant_id", "subject_email_hash", "created_at"),
        Index("idx_customer_events_tenant_type", "tenant_id", "event_type"),
        Index("idx_customer_events_related", "related_entity_type", "related_entity_id"),
    )

    def __repr__(self) -> str:
        return f"<CustomerEvent {self.event_type} portal_user={self.portal_user_id}>"
