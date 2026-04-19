"""Write-side helper for the unified ``customer_events`` log.

Every customer-affecting write in the codebase should flow through
:meth:`CustomerEventService.record`. The helper enforces the invariants
the plan relies on (see ``.claude/plans/smooth-sprouting-perlis.md``):

* ``event_type`` must be a :class:`CustomerEventType` enum value (no raw
  strings), so the set of known events stays bounded.
* ``event_type.value`` must be prefixed with ``domain + "."`` — a
  ``training.registered`` event cannot be written under ``domain=portal``.
* ``subject_email_hash`` must be non-empty — it is the stable identity
  across merges/deletes and the fallback lookup key for the timeline
  reader.
* ``actor_kind`` must be one of the known kinds.

The helper only ``db.add()``s the row; the caller commits so that the
event is atomic with its surrounding domain work.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.pii_crypto import hash_email
from app.models.customer_event import (
    ACTOR_ADMIN,
    ACTOR_SYSTEM,
    DOMAIN_TRAINING,
    VALID_ACTOR_KINDS,
    VALID_DOMAINS,
    CustomerEvent,
    CustomerEventType,
)

if TYPE_CHECKING:
    from app.models.training_attendee import TrainingAttendee


class CustomerEventService:
    """Stateless record-only helper for ``customer_events``."""

    @staticmethod
    def record(
        db: AsyncSession,
        *,
        tenant_id: UUID,
        portal_user_id: UUID | None,
        subject_email_hash: str,
        domain: str,
        event_type: CustomerEventType,
        actor_kind: str = ACTOR_SYSTEM,
        created_by: UUID | None = None,
        notes: str | None = None,
        meta: dict[str, Any] | None = None,
        related_entity_type: str | None = None,
        related_entity_id: UUID | None = None,
    ) -> CustomerEvent:
        """Append a ``customer_events`` row. Caller commits."""
        if not isinstance(event_type, CustomerEventType):
            raise ValueError(f"event_type must be a CustomerEventType enum member, got {type(event_type).__name__}")
        if domain not in VALID_DOMAINS:
            raise ValueError(f"unknown domain {domain!r} (allowed: {sorted(VALID_DOMAINS)})")
        if not event_type.value.startswith(domain + "."):
            raise ValueError(f"event_type {event_type.value!r} does not belong to domain {domain!r}")
        if not subject_email_hash:
            raise ValueError("subject_email_hash is required (stable identity across merges)")
        if actor_kind not in VALID_ACTOR_KINDS:
            raise ValueError(f"unknown actor_kind {actor_kind!r} (allowed: {sorted(VALID_ACTOR_KINDS)})")

        entry = CustomerEvent(
            tenant_id=tenant_id,
            portal_user_id=portal_user_id,
            subject_email_hash=subject_email_hash,
            domain=domain,
            event_type=event_type.value,
            actor_kind=actor_kind,
            created_by=created_by,
            notes=notes,
            meta=meta,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
        )
        db.add(entry)
        return entry

    @staticmethod
    def record_for_attendee(
        db: AsyncSession,
        att: TrainingAttendee,
        *,
        event_type: CustomerEventType,
        actor_kind: str = ACTOR_ADMIN,
        created_by: UUID | None = None,
        notes: str | None = None,
        meta: dict[str, Any] | None = None,
    ) -> CustomerEvent:
        """Record a ``training.*`` event tied to a ``TrainingAttendee``.

        Resolves ``subject_email_hash`` from ``att.email_hash`` (falls back to
        hashing ``att.email`` if unset on a historic row) and auto-wires the
        polymorphic ``related_entity_type``/``related_entity_id`` pointer so
        the timeline reader can surface "events for this attendee" via the
        ``idx_customer_events_related`` index.
        """
        subject_hash = att.email_hash or (hash_email(att.email) if att.email else "")
        return CustomerEventService.record(
            db,
            tenant_id=att.tenant_id,
            portal_user_id=att.portal_user_id,
            subject_email_hash=subject_hash,
            domain=DOMAIN_TRAINING,
            event_type=event_type,
            actor_kind=actor_kind,
            created_by=created_by,
            notes=notes,
            meta=meta,
            related_entity_type="training_attendee",
            related_entity_id=att.id,
        )
