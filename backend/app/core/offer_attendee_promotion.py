"""Offer-attendee lifecycle service.

When a training offer is accepted (or when an attendee is added to an
already-accepted offer), every ``OfferAttendee`` row must be promoted:

  1. Resolve or create the shared ``TrainingAttendee`` identity (deduped
     by ``(tenant_id, email_hash)``). Reactivate if ``parked``.
  2. Link ``OfferAttendee.attendee_id`` to that TrainingAttendee.
  3. Ensure a ``PortalUser`` exists for the attendee's email and link it
     to the TrainingAttendee (reuses
     ``ensure_portal_user_for_offer_attendee`` which dispatches the
     password-set invite on first creation).
  4. Send the registration confirmation email via the
     ``training_attendee_registered`` template.
  5. Audit ``OFFER_ATTENDEE_PROMOTED``.

When an accepted offer-attendee is deleted or has its email changed, the
link between the OfferAttendee and the TrainingAttendee is severed (the
``attendee_id`` FK is cleared before the row is deleted / re-promoted).
The ``TrainingAttendee`` and ``PortalUser`` rows stay — the person keeps
their portal account but loses portal visibility of this specific
training because the UNIONed portal query now has no OfferAttendee row
pointing at them for this placement.

Name-only edits go through a lighter sync that just pushes the new
first/last name down to the linked ``TrainingAttendee`` so the portal
shows the corrected name. No revoke, no new email.

All helpers are idempotent and commit-agnostic except where they need a
flush to obtain a PK. Callers commit once at the end of the transaction.
"""

from __future__ import annotations

import logging
from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.portal_user_service import ensure_portal_user_for_offer_attendee
from app.core.training_attendee_resolver import resolve_or_create_training_attendee
from app.models.audit import AuditAction, AuditLog
from app.models.customer_offer import CustomerOffer
from app.models.offer_attendee import OfferAttendee
from app.models.portal_user import PortalUser
from app.models.tenant import Tenant
from app.models.training_attendee import TrainingAttendee

logger = logging.getLogger(__name__)


async def promote_offer_attendee(
    db: AsyncSession,
    offer_attendee: OfferAttendee,
    offer: CustomerOffer,
    tenant: Tenant,
    *,
    user_id: UUID | None = None,
) -> tuple[TrainingAttendee, PortalUser | None]:
    """Promote an OfferAttendee to a TrainingAttendee + PortalUser.

    Idempotent: if the OfferAttendee is already linked to a matching
    TrainingAttendee, the function updates names + ensures the portal
    link but does not re-send the registration email.

    Does NOT dispatch the registration email itself — callers schedule
    that via ``send_email_background`` AFTER the outer commit, so the
    email never races with the DB transaction.

    Audits ``OFFER_ATTENDEE_PROMOTED``.
    """
    if not offer_attendee.email:
        raise ValueError(f"Offer attendee {offer_attendee.id} has no email; cannot promote")

    attendee = await resolve_or_create_training_attendee(
        db,
        tenant_id=tenant.id,
        email=offer_attendee.email,
        first_name=offer_attendee.first_name,
        last_name=offer_attendee.last_name,
    )
    was_already_linked = offer_attendee.attendee_id == attendee.id
    offer_attendee.attendee_id = attendee.id

    portal_user = await ensure_portal_user_for_offer_attendee(db, offer_attendee, tenant)
    if portal_user and attendee.portal_user_id is None:
        attendee.portal_user_id = portal_user.id

    db.add(
        AuditLog(
            tenant_id=tenant.id,
            user_id=user_id,
            action=AuditAction.OFFER_ATTENDEE_PROMOTED,
            resource_type="offer_attendee",
            resource_id=offer_attendee.id,
            subject_email_hash=attendee.email_hash,
            details={
                "offer_id": str(offer.id),
                "placement_id": str(offer_attendee.placement_id) if offer_attendee.placement_id else None,
                "training_attendee_id": str(attendee.id),
                "portal_user_id": str(portal_user.id) if portal_user else None,
                "already_linked": was_already_linked,
            },
        )
    )

    return attendee, portal_user


async def revoke_offer_attendee_access(
    db: AsyncSession,
    offer_attendee: OfferAttendee,
    tenant: Tenant,
    reason: Literal["deleted", "email_changed"],
    *,
    user_id: UUID | None = None,
) -> None:
    """Revoke the portal's visibility of this training for an offer attendee.

    The attendee-ID link on ``offer_attendee`` is cleared. The underlying
    ``TrainingAttendee`` and ``PortalUser`` rows are left intact — the
    user keeps their account and any other trainings they're in.

    On deletion, the caller then deletes the OfferAttendee row. On email
    change, the caller applies the new email + calls
    ``promote_offer_attendee`` with the updated row.

    Audits ``OFFER_ATTENDEE_REVOKED``.
    """
    previous_attendee_id = offer_attendee.attendee_id
    prev_email_hash = offer_attendee.email_hash

    offer_attendee.attendee_id = None

    db.add(
        AuditLog(
            tenant_id=tenant.id,
            user_id=user_id,
            action=AuditAction.OFFER_ATTENDEE_REVOKED,
            resource_type="offer_attendee",
            resource_id=offer_attendee.id,
            subject_email_hash=prev_email_hash,
            details={
                "offer_id": str(offer_attendee.offer_id),
                "placement_id": str(offer_attendee.placement_id) if offer_attendee.placement_id else None,
                "previous_training_attendee_id": (str(previous_attendee_id) if previous_attendee_id else None),
                "reason": reason,
            },
        )
    )


async def sync_offer_attendee_name(
    db: AsyncSession,
    offer_attendee: OfferAttendee,
) -> None:
    """Cosmetic sync: push first/last name down to the linked TrainingAttendee.

    Called when a name is edited on an already-promoted OfferAttendee
    but the email (identity) didn't change. Portal shows the corrected
    name. No audit entry — the standard ``offer_attendee.update`` audit
    log already captures the edit.
    """
    if not offer_attendee.attendee_id:
        return

    result = await db.execute(select(TrainingAttendee).where(TrainingAttendee.id == offer_attendee.attendee_id))
    attendee = result.scalar_one_or_none()
    if attendee is None:
        return

    attendee.first_name = offer_attendee.first_name
    attendee.last_name = offer_attendee.last_name
