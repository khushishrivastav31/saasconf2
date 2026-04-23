"""Training attendees — parking-lot state transitions (park / deactivate / reactivate)."""

import json
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError
from app.models.customer_event import CustomerEventType
from app.models.offer_attendee import OfferAttendee
from app.models.portal_user import PortalUser
from app.models.training_attendee import TrainingAttendee
from app.models.training_attendee_history import TrainingAttendeeHistory
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.services.customer_event_service import CustomerEventService

from ._helpers import get_or_create_central_attendee

router = APIRouter(prefix="/attendees", tags=["training-attendees"])


class ParkRequest(BaseModel):
    reason: str | None = None
    source_type: str  # "registration" | "offer"
    source_id: str  # UUID of the reg_attendee or offer_attendee


class DeactivateAttendeeRequest(BaseModel):
    notes: str | None = None


@router.post("/park-by-source")
async def park_by_source(
    data: ParkRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Park an attendee using the registration/offer attendee source ID.

    Automatically creates a central TrainingAttendee if one doesn't exist yet.
    """
    tenant_id = current_user.require_tenant_id()
    source_uuid = UUID(data.source_id)
    placement_id: UUID | None = None
    att: TrainingAttendee | None = None
    registration_id: UUID | None = None

    if data.source_type == "registration":
        ra_result = await db.execute(
            select(TrainingRegistrationAttendee).where(
                TrainingRegistrationAttendee.id == source_uuid,
                TrainingRegistrationAttendee.tenant_id == tenant_id,
            )
        )
        ra = ra_result.scalar_one_or_none()
        if not ra:
            raise NotFoundError("Registration attendee not found")
        att = await get_or_create_central_attendee(db, tenant_id, ra.first_name, ra.last_name, ra.email)
        ra.attendee_id = att.id
        registration_id = ra.registration_id
        reg_q = await db.execute(
            select(TrainingRegistration.placement_id).where(TrainingRegistration.id == ra.registration_id)
        )
        placement_id = reg_q.scalar_one_or_none()
        await db.delete(ra)

    elif data.source_type == "offer":
        oa_result = await db.execute(
            select(OfferAttendee).where(
                OfferAttendee.id == source_uuid,
                OfferAttendee.tenant_id == tenant_id,
            )
        )
        oa = oa_result.scalar_one_or_none()
        if not oa:
            raise NotFoundError("Offer attendee not found")
        if oa.email:
            att = await get_or_create_central_attendee(db, tenant_id, oa.first_name, oa.last_name, oa.email)
            oa.attendee_id = att.id
        placement_id = oa.placement_id
        await db.delete(oa)
    else:
        raise HTTPException(status_code=422, detail="source_type must be 'registration' or 'offer'")

    if not att:
        raise HTTPException(status_code=422, detail="Could not create central attendee (missing email)")

    att.status = "parked"
    source_ref = registration_id if registration_id else source_uuid
    db.add(
        TrainingAttendeeHistory(
            tenant_id=tenant_id,
            attendee_id=att.id,
            event_type="parked",
            placement_id=placement_id,
            registration_id=registration_id,
            source_type=data.source_type,
            source_id=source_ref,
            notes=data.reason,
            created_by=current_user.user_id,
        )
    )
    CustomerEventService.record_for_attendee(
        db,
        att,
        event_type=CustomerEventType.TRAINING_PARKED,
        created_by=current_user.user_id,
        notes=data.reason,
        meta={
            "placement_id": str(placement_id) if placement_id else None,
            "registration_id": str(registration_id) if registration_id else None,
            "source_type": data.source_type,
            "source_id": str(source_ref),
        },
    )
    await db.commit()

    return {"id": str(att.id), "status": att.status, "name": f"{att.first_name} {att.last_name}"}


@router.post("/{attendee_id}/park")
async def park_attendee(
    attendee_id: UUID,
    data: ParkRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Park an attendee — remove from registration/offer and place in parking lot."""
    result = await db.execute(
        select(TrainingAttendee).where(
            TrainingAttendee.id == attendee_id,
            TrainingAttendee.tenant_id == current_user.require_tenant_id(),
        )
    )
    att = result.scalar_one_or_none()
    if not att:
        raise NotFoundError("Attendee not found")

    if att.status == "parked":
        raise HTTPException(status_code=422, detail="Attendee is already parked.")

    source_uuid = UUID(data.source_id)
    placement_id: UUID | None = None
    registration_id: UUID | None = None
    exam_data: dict | None = None

    if data.source_type == "registration":
        reg_att_result = await db.execute(
            select(TrainingRegistrationAttendee).where(
                TrainingRegistrationAttendee.id == source_uuid,
                TrainingRegistrationAttendee.tenant_id == current_user.require_tenant_id(),
            )
        )
        reg_att = reg_att_result.scalar_one_or_none()
        if reg_att:
            reg_result = await db.execute(
                select(TrainingRegistration.placement_id).where(TrainingRegistration.id == reg_att.registration_id)
            )
            placement_id = reg_result.scalar_one_or_none()
            # Capture the stable registration pointer BEFORE deleting the
            # per-attendee bridge row — Cancel Registration needs this to
            # locate the TrainingInvoice for parked attendees later.
            registration_id = reg_att.registration_id
            exam_data = {
                "exam_mode": reg_att.exam_mode,
                "exam_language": reg_att.exam_language,
                "extra_time": reg_att.extra_time,
            }
            await db.delete(reg_att)

    elif data.source_type == "offer":
        offer_att_result = await db.execute(
            select(OfferAttendee).where(
                OfferAttendee.id == source_uuid,
                OfferAttendee.tenant_id == current_user.require_tenant_id(),
            )
        )
        offer_att = offer_att_result.scalar_one_or_none()
        if offer_att:
            placement_id = offer_att.placement_id
            exam_data = {
                "exam_mode": offer_att.exam_mode,
                "exam_language": offer_att.exam_language,
                "extra_time": offer_att.extra_time,
            }
            await db.delete(offer_att)

    att.status = "parked"

    notes_obj: dict = {}
    if data.reason:
        notes_obj["reason"] = data.reason
    if exam_data and any(v for v in exam_data.values()):
        notes_obj["exam_data"] = exam_data
    notes_str = json.dumps(notes_obj) if notes_obj else data.reason

    history = TrainingAttendeeHistory(
        tenant_id=current_user.require_tenant_id(),
        attendee_id=att.id,
        event_type="parked",
        placement_id=placement_id,
        registration_id=registration_id,
        source_type=data.source_type,
        source_id=source_uuid,
        notes=notes_str,
        created_by=current_user.user_id,
    )
    db.add(history)
    CustomerEventService.record_for_attendee(
        db,
        att,
        event_type=CustomerEventType.TRAINING_PARKED,
        created_by=current_user.user_id,
        notes=notes_str,
        meta={
            "placement_id": str(placement_id) if placement_id else None,
            "registration_id": str(registration_id) if registration_id else None,
            "source_type": data.source_type,
            "source_id": str(source_uuid),
        },
    )
    await db.commit()

    return {"id": str(att.id), "status": att.status}


@router.post("/{attendee_id}/deactivate")
async def deactivate_attendee(
    attendee_id: UUID,
    data: DeactivateAttendeeRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Deactivate a parked attendee — flips status to 'inactive' and hides from the parking lot.

    Only attendees with status ``parked`` can be deactivated. Active attendees must be
    parked first (via ``/park`` or ``/park-by-source``). Writes a ``deactivated`` history
    event. Reactivation happens via the reciprocal endpoint or by toggling the linked
    portal user back on.
    """
    result = await db.execute(
        select(TrainingAttendee).where(
            TrainingAttendee.id == attendee_id,
            TrainingAttendee.tenant_id == current_user.require_tenant_id(),
        )
    )
    att = result.scalar_one_or_none()
    if not att:
        raise NotFoundError("Attendee not found")
    if att.status != "parked":
        raise HTTPException(status_code=422, detail="Only parked attendees can be deactivated.")

    att.status = "inactive"
    deactivate_notes = data.notes or "Deactivated from parking lot"
    db.add(
        TrainingAttendeeHistory(
            tenant_id=current_user.require_tenant_id(),
            attendee_id=att.id,
            event_type="deactivated",
            notes=deactivate_notes,
            created_by=current_user.user_id,
        )
    )
    CustomerEventService.record_for_attendee(
        db,
        att,
        event_type=CustomerEventType.TRAINING_DEACTIVATED,
        created_by=current_user.user_id,
        notes=deactivate_notes,
    )
    await db.commit()
    return {"id": str(att.id), "status": att.status}


@router.post("/{attendee_id}/reactivate")
async def reactivate_attendee(
    attendee_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Reactivate an inactive attendee — sets ``status='active'`` so the user is operational.

    Also handles the historical case where ``attendee.status`` is still ``parked`` but
    the portal account has been deactivated (effective-status = inactive). In that case,
    the portal account is reactivated *and* the attendee is moved to ``active``.

    Reactivation never puts a user back into the parking lot. If the user later
    needs to be parked again, admins can use the usual parking flow.
    """
    result = await db.execute(
        select(TrainingAttendee).where(
            TrainingAttendee.id == attendee_id,
            TrainingAttendee.tenant_id == current_user.require_tenant_id(),
        )
    )
    att = result.scalar_one_or_none()
    if not att:
        raise NotFoundError("Attendee not found")

    portal_user: PortalUser | None = None
    if att.portal_user_id:
        portal_user = await db.get(PortalUser, att.portal_user_id)

    is_inactive_attendee = att.status == "inactive"
    is_parked_with_dead_portal = att.status == "parked" and portal_user is not None and portal_user.is_active is False

    if not is_inactive_attendee and not is_parked_with_dead_portal:
        raise HTTPException(status_code=422, detail="Only inactive attendees can be reactivated.")

    if att.status != "active":
        att.status = "active"
        db.add(
            TrainingAttendeeHistory(
                tenant_id=current_user.require_tenant_id(),
                attendee_id=att.id,
                event_type="reactivated",
                notes="Attendee reactivated",
                created_by=current_user.user_id,
            )
        )
        CustomerEventService.record_for_attendee(
            db,
            att,
            event_type=CustomerEventType.TRAINING_REACTIVATED,
            created_by=current_user.user_id,
            notes="Attendee reactivated",
        )

    if portal_user is not None and portal_user.is_active is False:
        portal_user.is_active = True

    await db.commit()
    return {"id": str(att.id), "status": att.status}
