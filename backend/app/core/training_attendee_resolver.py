"""Shared helper: resolve or create a ``TrainingAttendee`` identity.

``TrainingAttendee`` is the unified, tenant-scoped identity that ties every
training-touchpoint (public registration, offer acceptance, admin assignment)
to a single row keyed by ``(tenant_id, email_hash)``. It is what the admin
Attendee list queries and what the portal query joins through to find a
user's trainings.

Historically the public registration flow only created
``TrainingRegistrationAttendee`` rows and never the unified identity row,
which is why attendees registered via the portal would sometimes miss from
the admin Attendee list and their own portal view.
``resolve_or_create_training_attendee`` centralizes the rule so every flow
that owns an attendee identity creates / reactivates the same row.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.pii_crypto import hash_email
from app.models.training_attendee import TrainingAttendee

logger = logging.getLogger(__name__)


async def resolve_or_create_training_attendee(
    db: AsyncSession,
    *,
    tenant_id,
    email: str,
    first_name: str,
    last_name: str,
) -> TrainingAttendee:
    """Find a TrainingAttendee for (tenant_id, lowered email) or create one.

    Side effects:
      * Refreshes the stored first/last name from the caller so later renames
        in the source row (registration attendee, offer attendee) flow down
        to the unified identity.
      * Reactivates ``parked`` rows to ``active`` — if an attendee returns,
        their unified identity comes back to life.
      * Flushes the session when creating, so the caller can read ``.id``
        for FK wiring without an extra round trip.

    Raises:
      ValueError: if ``email`` is empty after stripping.
    """
    cleaned = (email or "").strip().lower()
    if not cleaned:
        raise ValueError("Cannot resolve TrainingAttendee without an email")

    email_hash = hash_email(cleaned)
    result = await db.execute(
        select(TrainingAttendee).where(
            TrainingAttendee.tenant_id == tenant_id,
            TrainingAttendee.email_hash == email_hash,
        )
    )
    attendee = result.scalar_one_or_none()

    if attendee is None:
        attendee = TrainingAttendee(
            tenant_id=tenant_id,
            first_name=first_name,
            last_name=last_name,
            status="active",
        )
        attendee.email = cleaned  # triggers encrypt + hash via property
        db.add(attendee)
        await db.flush()
        logger.info("Created TrainingAttendee %s for tenant %s (%s)", attendee.id, tenant_id, cleaned)
    else:
        attendee.first_name = first_name
        attendee.last_name = last_name
        if attendee.status == "parked":
            attendee.status = "active"

    return attendee
