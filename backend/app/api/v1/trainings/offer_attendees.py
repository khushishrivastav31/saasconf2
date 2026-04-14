"""Offer attendee endpoints — manage participants for offer placements."""

import logging
from uuid import UUID

from fastapi import APIRouter, Query, Request
from sqlalchemy import select

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.customer_offer import CustomerOffer
from app.models.offer_attendee import OfferAttendee
from app.models.offer_placement import OfferPlacement
from app.models.training_program import ProgramYearTraining
from app.schemas.offer_attendee import OfferAttendeeCreate, OfferAttendeeResponse, OfferAttendeeUpdate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/offers/{offer_id}/attendees", tags=["offer-attendees"])


async def _get_offer(db: DbSessionDep, offer_id: UUID, tenant_id: UUID) -> CustomerOffer:
    """Get an offer or raise NotFoundError."""
    result = await db.execute(
        select(CustomerOffer).where(CustomerOffer.id == offer_id, CustomerOffer.tenant_id == tenant_id)
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise NotFoundError("Offer not found")
    return offer


async def _validate_placement(db: DbSessionDep, placement_id: UUID, offer_id: UUID, tenant_id: UUID) -> None:
    """Validate that a placement belongs to the tenant and is linked to the offer.

    Checks both the direct FK (ProgramYearTraining.offer_id) for inhouse placements
    and the OfferPlacement join table for open placements.
    """
    # Check direct FK (inhouse/hybrid placements)
    result = await db.execute(
        select(ProgramYearTraining).where(
            ProgramYearTraining.id == placement_id,
            ProgramYearTraining.tenant_id == tenant_id,
            ProgramYearTraining.offer_id == offer_id,
        )
    )
    if result.scalar_one_or_none():
        return

    # Check join table (open placements)
    join_result = await db.execute(
        select(OfferPlacement).where(
            OfferPlacement.offer_id == offer_id,
            OfferPlacement.placement_id == placement_id,
        )
    )
    if join_result.scalar_one_or_none():
        return

    raise ValidationError("Placement not found on this offer")


@router.get("", response_model=list[OfferAttendeeResponse])
async def list_attendees(
    offer_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    placement_id: UUID | None = Query(None),
) -> list[OfferAttendeeResponse]:
    """List attendees for an offer, optionally filtered by placement."""
    tenant_id = current_user.tenant_id
    await _get_offer(db, offer_id, tenant_id)

    query = select(OfferAttendee).where(
        OfferAttendee.offer_id == offer_id,
        OfferAttendee.tenant_id == tenant_id,
    )
    if placement_id:
        query = query.where(OfferAttendee.placement_id == placement_id)

    query = query.order_by(OfferAttendee.created_at)
    result = await db.execute(query)
    return [OfferAttendeeResponse.model_validate(a) for a in result.scalars().all()]


@router.post("", response_model=OfferAttendeeResponse, status_code=201)
async def create_attendee(
    offer_id: UUID,
    payload: OfferAttendeeCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> OfferAttendeeResponse:
    """Create an attendee for an offer placement."""
    tenant_id = current_user.tenant_id
    await _get_offer(db, offer_id, tenant_id)
    await _validate_placement(db, payload.placement_id, offer_id, tenant_id)

    attendee = OfferAttendee(
        tenant_id=tenant_id,
        offer_id=offer_id,
        placement_id=payload.placement_id,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        email=payload.email.strip() if payload.email else None,
        certification=payload.certification,
        exam_mode=payload.exam_mode,
        extra_time=payload.extra_time,
        exam_language=payload.exam_language.strip() if payload.exam_language else None,
        comments=payload.comments.strip() if payload.comments else None,
    )
    db.add(attendee)

    audit_log = AuditLog(
        tenant_id=tenant_id,
        user_id=current_user.user_id,
        action="offer_attendee.create",
        resource_type="offer_attendee",
        resource_id=attendee.id,
        details={
            "offer_id": str(offer_id),
            "placement_id": str(payload.placement_id),
            "name": f"{payload.first_name} {payload.last_name}",
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(attendee)

    return OfferAttendeeResponse.model_validate(attendee)


@router.put("/{attendee_id}", response_model=OfferAttendeeResponse)
async def update_attendee(
    offer_id: UUID,
    attendee_id: UUID,
    payload: OfferAttendeeUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> OfferAttendeeResponse:
    """Update an offer attendee."""
    tenant_id = current_user.tenant_id
    await _get_offer(db, offer_id, tenant_id)

    result = await db.execute(
        select(OfferAttendee).where(
            OfferAttendee.id == attendee_id,
            OfferAttendee.offer_id == offer_id,
            OfferAttendee.tenant_id == tenant_id,
        )
    )
    attendee = result.scalar_one_or_none()
    if not attendee:
        raise NotFoundError("Attendee not found")

    update_data = payload.model_dump(exclude_unset=True)
    # Strip string fields
    for field in ("first_name", "last_name", "email", "exam_language", "comments"):
        if field in update_data and isinstance(update_data[field], str):
            update_data[field] = (
                update_data[field].strip() or None
                if field != "first_name" and field != "last_name"
                else update_data[field].strip()
            )

    for field, value in update_data.items():
        setattr(attendee, field, value)

    audit_log = AuditLog(
        tenant_id=tenant_id,
        user_id=current_user.user_id,
        action="offer_attendee.update",
        resource_type="offer_attendee",
        resource_id=attendee_id,
        details={"offer_id": str(offer_id), "updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(attendee)

    return OfferAttendeeResponse.model_validate(attendee)


@router.delete("/{attendee_id}")
async def delete_attendee(
    offer_id: UUID,
    attendee_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete an offer attendee."""
    tenant_id = current_user.tenant_id
    await _get_offer(db, offer_id, tenant_id)

    result = await db.execute(
        select(OfferAttendee).where(
            OfferAttendee.id == attendee_id,
            OfferAttendee.offer_id == offer_id,
            OfferAttendee.tenant_id == tenant_id,
        )
    )
    attendee = result.scalar_one_or_none()
    if not attendee:
        raise NotFoundError("Attendee not found")

    attendee_name = f"{attendee.first_name} {attendee.last_name}"
    await db.delete(attendee)

    audit_log = AuditLog(
        tenant_id=tenant_id,
        user_id=current_user.user_id,
        action="offer_attendee.delete",
        resource_type="offer_attendee",
        resource_id=attendee_id,
        details={"offer_id": str(offer_id), "name": attendee_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "Attendee deleted"}
