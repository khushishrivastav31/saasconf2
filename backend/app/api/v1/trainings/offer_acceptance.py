"""Offer acceptance endpoint — promotes every attendee on the offer."""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.core.email import send_email_background
from app.core.email.trainings import send_offer_attendee_registered_email
from app.core.exceptions import NotFoundError, ValidationError
from app.core.offer_attendee_promotion import promote_offer_attendee
from app.models.audit import AuditAction, AuditLog
from app.models.customer_offer import CustomerOffer
from app.models.offer_attendee import OfferAttendee
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/offers", tags=["training-offers"])


@router.post("/{offer_id}/accept")
async def accept_offer(
    offer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Accept an offer: promote every attendee to a TrainingAttendee + PortalUser,
    then dispatch the registration email to each of them.

    Rejects with 400 if any attendee has no email — they can't be promoted.
    Rejects with 400 if the offer is already accepted (idempotency boundary;
    post-acceptance attendee inserts flow through the create-attendee path
    which runs the same promotion for new rows).
    """
    tenant_id = current_user.require_tenant_id()

    offer_result = await db.execute(
        select(CustomerOffer).where(CustomerOffer.id == offer_id, CustomerOffer.tenant_id == tenant_id)
    )
    offer = offer_result.scalar_one_or_none()
    if offer is None:
        raise NotFoundError("Offer not found")

    if offer.status == "accepted":
        raise ValidationError("Offer is already accepted")

    att_result = await db.execute(
        select(OfferAttendee).where(
            OfferAttendee.offer_id == offer_id,
            OfferAttendee.tenant_id == tenant_id,
        )
    )
    attendees = list(att_result.scalars().all())

    missing_email_ids = [str(a.id) for a in attendees if not (a.email or "").strip()]
    if missing_email_ids:
        raise ValidationError(
            f"Cannot accept offer: {len(missing_email_ids)} attendee(s) missing email: {', '.join(missing_email_ids)}"
        )

    tenant_result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = tenant_result.scalar_one()

    offer.status = "accepted"

    for attendee in attendees:
        await promote_offer_attendee(db, attendee, offer, tenant, user_id=current_user.user_id)

    db.add(
        AuditLog(
            tenant_id=tenant_id,
            user_id=current_user.user_id,
            action=AuditAction.OFFER_ACCEPTED,
            resource_type="customer_offer",
            resource_id=offer_id,
            details={
                "offer_number": offer.offer_number,
                "attendee_count": len(attendees),
            },
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )
    await db.commit()

    # Dispatch emails after the outer commit so a background task with a
    # fresh session sees the promoted state. Passing ``db`` positionally
    # triggers the session-swap wrapper; passing the attendee id (not the
    # object) keeps the call free of cross-session references.
    for attendee in attendees:
        send_email_background(send_offer_attendee_registered_email, db, attendee.id, tenant)

    return {"message": "Offer accepted", "attendees_promoted": len(attendees)}
