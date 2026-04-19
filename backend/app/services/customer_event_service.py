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

from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer_event import (
    ACTOR_SYSTEM,
    VALID_ACTOR_KINDS,
    VALID_DOMAINS,
    CustomerEvent,
    CustomerEventType,
)


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
