"""Training attendees — central identity, parking lot, and history endpoints."""

import json
import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.attendee_reassignment import (
    cancel_old_invoice_with_credit_note,
    cleanup_empty_registration,
    create_new_registration,
    create_replacement_invoice,
    find_old_invoice,
    find_old_registration,
)
from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError
from app.core.training_registration_emails import send_training_invoice_email
from app.models.offer_attendee import OfferAttendee
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_attendee_history import TrainingAttendeeHistory
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/attendees", tags=["training-attendees"])


# ── Helpers ───────────────────────────────────────────────────────────────────


async def get_or_create_central_attendee(
    db: DbSessionDep,
    tenant_id: UUID,
    first_name: str,
    last_name: str,
    email: str,
) -> TrainingAttendee:
    """Find or create a central TrainingAttendee record by (tenant_id, email)."""
    result = await db.execute(
        select(TrainingAttendee).where(
            TrainingAttendee.tenant_id == tenant_id,
            TrainingAttendee.email == email,
        )
    )
    attendee = result.scalar_one_or_none()
    if attendee:
        # Update name if changed
        if attendee.first_name != first_name or attendee.last_name != last_name:
            attendee.first_name = first_name
            attendee.last_name = last_name
        return attendee

    attendee = TrainingAttendee(
        tenant_id=tenant_id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        status="active",
    )
    db.add(attendee)
    await db.flush()
    return attendee


async def _get_training_name_for_placement(db: DbSessionDep, placement_id: UUID | None) -> str:
    if not placement_id:
        return "—"
    result = await db.execute(
        select(Training.name)
        .join(ProgramYearTraining, ProgramYearTraining.training_id == Training.id)
        .where(ProgramYearTraining.id == placement_id)
    )
    name = result.scalar_one_or_none()
    return name or "Unknown"


# ── Schemas ───────────────────────────────────────────────────────────────────


class ParkRequest(BaseModel):
    reason: str | None = None
    source_type: str  # "registration" | "offer"
    source_id: str  # UUID of the reg_attendee or offer_attendee


class ReassignRequest(BaseModel):
    placement_id: str
    notes: str | None = None


# ── Backfill ──────────────────────────────────────────────────────────────────


@router.post("/backfill")
async def backfill_central_attendees(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Backfill central TrainingAttendee records from existing registration + offer attendees."""
    tenant_id = current_user.tenant_id
    created = 0
    linked = 0

    # Registration attendees without a central link
    reg_result = await db.execute(
        select(TrainingRegistrationAttendee).where(
            TrainingRegistrationAttendee.tenant_id == tenant_id,
            TrainingRegistrationAttendee.attendee_id.is_(None),
        )
    )
    for ra in reg_result.scalars().all():
        att = await get_or_create_central_attendee(db, tenant_id, ra.first_name, ra.last_name, ra.email)
        ra.attendee_id = att.id
        linked += 1
        if att.created_at == att.updated_at:  # freshly created
            created += 1
            # Get placement from registration
            reg_q = await db.execute(
                select(TrainingRegistration.placement_id).where(TrainingRegistration.id == ra.registration_id)
            )
            placement_id = reg_q.scalar_one_or_none()
            db.add(
                TrainingAttendeeHistory(
                    tenant_id=tenant_id,
                    attendee_id=att.id,
                    event_type="registered",
                    placement_id=placement_id,
                    source_type="registration",
                    source_id=ra.id,
                )
            )

    # Offer attendees without a central link
    oa_result = await db.execute(
        select(OfferAttendee).where(
            OfferAttendee.tenant_id == tenant_id,
            OfferAttendee.attendee_id.is_(None),
        )
    )
    for oa in oa_result.scalars().all():
        if not oa.email:
            continue
        att = await get_or_create_central_attendee(db, tenant_id, oa.first_name, oa.last_name, oa.email)
        oa.attendee_id = att.id
        linked += 1
        if att.created_at == att.updated_at:
            created += 1
            db.add(
                TrainingAttendeeHistory(
                    tenant_id=tenant_id,
                    attendee_id=att.id,
                    event_type="offer_assigned",
                    placement_id=oa.placement_id,
                    source_type="offer",
                    source_id=oa.id,
                )
            )

    await db.commit()
    return {"created": created, "linked": linked}


@router.post("/park-by-source")
async def park_by_source(
    data: ParkRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Park an attendee using the registration/offer attendee source ID.

    Automatically creates a central TrainingAttendee if one doesn't exist yet.
    """
    tenant_id = current_user.tenant_id
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
        # Ensure central record
        att = await get_or_create_central_attendee(db, tenant_id, ra.first_name, ra.last_name, ra.email)
        ra.attendee_id = att.id
        # Store registration_id for reassignment tracing
        registration_id = ra.registration_id
        # Get placement
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
    # Store registration_id (not attendee row ID) so reassignment can find the exact registration
    db.add(
        TrainingAttendeeHistory(
            tenant_id=tenant_id,
            attendee_id=att.id,
            event_type="parked",
            placement_id=placement_id,
            source_type=data.source_type,
            source_id=registration_id if registration_id else source_uuid,
            notes=data.reason,
            created_by=current_user.user_id,
        )
    )
    await db.commit()

    return {"id": str(att.id), "status": att.status, "name": f"{att.first_name} {att.last_name}"}


@router.get("/available-placements")
async def list_available_placements(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> list[dict]:
    """List future training placements for reassignment picker with training details."""
    from datetime import date as date_type

    result = await db.execute(
        select(ProgramYearTraining)
        .options(
            selectinload(ProgramYearTraining.training).selectinload(Training.language),
        )
        .join(Training, ProgramYearTraining.training_id == Training.id)
        .where(ProgramYearTraining.start_date >= date_type.today())
        .order_by(ProgramYearTraining.start_date)
    )
    placements = result.scalars().unique().all()

    items = []
    for p in placements:
        t = p.training
        lang_name = t.language.name if t and t.language else None
        items.append(
            {
                "id": str(p.id),
                "training_name": t.name if t else "Unknown",
                "start_date": p.start_date.isoformat() if p.start_date else None,
                "placement_type": p.placement_type,
                "is_guaranteed": p.is_guaranteed,
                "language": lang_name,
            }
        )
    return items


# ── List endpoints ────────────────────────────────────────────────────────────


@router.get("")
async def list_attendees(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    status: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> dict:
    """List all central training attendees with latest history event."""
    query = select(TrainingAttendee).where(TrainingAttendee.tenant_id == current_user.tenant_id)

    if status and status != "all":
        query = query.where(TrainingAttendee.status == status)
    if search:
        s = search.lower()
        query = query.where(
            or_(
                func.lower(TrainingAttendee.first_name).contains(s),
                func.lower(TrainingAttendee.last_name).contains(s),
                func.lower(TrainingAttendee.email).contains(s),
            )
        )

    count_q = select(func.count()).select_from(query.with_only_columns(TrainingAttendee.id).subquery())
    total = (await db.execute(count_q)).scalar() or 0

    query = (
        query.options(selectinload(TrainingAttendee.history))
        .order_by(TrainingAttendee.last_name, TrainingAttendee.first_name)
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(query)
    attendees = result.scalars().unique().all()

    # Get training names for placement IDs in history
    placement_ids: set[UUID] = set()
    for att in attendees:
        for h in att.history:
            if h.placement_id:
                placement_ids.add(h.placement_id)

    training_names: dict[UUID, str] = {}
    training_dates: dict[UUID, str | None] = {}
    if placement_ids:
        tn_result = await db.execute(
            select(ProgramYearTraining.id, Training.name, ProgramYearTraining.start_date)
            .join(Training, ProgramYearTraining.training_id == Training.id)
            .where(ProgramYearTraining.id.in_(placement_ids))
        )
        for pid, tname, sdate in tn_result.all():
            date_str = sdate.strftime("%d.%m.%Y") if sdate else ""
            training_names[pid] = f"{tname} ({date_str})" if date_str else tname
            training_dates[pid] = sdate.isoformat() if sdate else None

    items = []
    for att in attendees:
        # Latest history event
        latest = att.history[0] if att.history else None
        current_training = "—"
        current_training_date: str | None = None
        if latest and latest.event_type in ("registered", "reassigned", "offer_assigned") and latest.placement_id:
            current_training = training_names.get(latest.placement_id, "—")
            current_training_date = training_dates.get(latest.placement_id)

        items.append(
            {
                "id": str(att.id),
                "first_name": att.first_name,
                "last_name": att.last_name,
                "email": att.email,
                "status": att.status,
                "notes": att.notes,
                "current_training": current_training,
                "current_training_date": current_training_date,
                "portal_user_id": str(att.portal_user_id) if att.portal_user_id else None,
                "created_at": att.created_at.isoformat() if att.created_at else None,
                "history": [
                    {
                        "id": str(h.id),
                        "event_type": h.event_type,
                        "placement_id": str(h.placement_id) if h.placement_id else None,
                        "training_name": training_names.get(h.placement_id, "—") if h.placement_id else "—",
                        "source_type": h.source_type,
                        "notes": h.notes,
                        "created_at": h.created_at.isoformat() if h.created_at else None,
                    }
                    for h in att.history
                ],
            }
        )

    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/{attendee_id}")
async def get_attendee(
    attendee_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Get a single attendee with full history."""
    result = await db.execute(
        select(TrainingAttendee)
        .options(selectinload(TrainingAttendee.history))
        .where(
            TrainingAttendee.id == attendee_id,
            TrainingAttendee.tenant_id == current_user.tenant_id,
        )
    )
    att = result.scalars().unique().first()
    if not att:
        raise NotFoundError("Attendee not found")

    # Get training names
    placement_ids = {h.placement_id for h in att.history if h.placement_id}
    training_names: dict[UUID, str] = {}
    if placement_ids:
        tn_result = await db.execute(
            select(ProgramYearTraining.id, Training.name, ProgramYearTraining.start_date)
            .join(Training, ProgramYearTraining.training_id == Training.id)
            .where(ProgramYearTraining.id.in_(placement_ids))
        )
        for pid, tname, sdate in tn_result.all():
            date_str = sdate.strftime("%d.%m.%Y") if sdate else ""
            training_names[pid] = f"{tname} ({date_str})" if date_str else tname

    return {
        "id": str(att.id),
        "first_name": att.first_name,
        "last_name": att.last_name,
        "email": att.email,
        "status": att.status,
        "notes": att.notes,
        "created_at": att.created_at.isoformat() if att.created_at else None,
        "history": [
            {
                "id": str(h.id),
                "event_type": h.event_type,
                "placement_id": str(h.placement_id) if h.placement_id else None,
                "training_name": training_names.get(h.placement_id, "—") if h.placement_id else "—",
                "source_type": h.source_type,
                "notes": h.notes,
                "created_at": h.created_at.isoformat() if h.created_at else None,
            }
            for h in att.history
        ],
    }


# ── Park endpoint ─────────────────────────────────────────────────────────────


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
            TrainingAttendee.tenant_id == current_user.tenant_id,
        )
    )
    att = result.scalar_one_or_none()
    if not att:
        raise NotFoundError("Attendee not found")

    if att.status == "parked":
        raise HTTPException(status_code=422, detail="Attendee is already parked.")

    source_uuid = UUID(data.source_id)
    placement_id: UUID | None = None
    exam_data: dict | None = None

    # Remove from source
    if data.source_type == "registration":
        reg_att_result = await db.execute(
            select(TrainingRegistrationAttendee).where(
                TrainingRegistrationAttendee.id == source_uuid,
                TrainingRegistrationAttendee.tenant_id == current_user.tenant_id,
            )
        )
        reg_att = reg_att_result.scalar_one_or_none()
        if reg_att:
            # Get placement from registration
            reg_result = await db.execute(
                select(TrainingRegistration.placement_id).where(TrainingRegistration.id == reg_att.registration_id)
            )
            placement_id = reg_result.scalar_one_or_none()
            # Preserve exam data before deleting (restored during reassignment)
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
                OfferAttendee.tenant_id == current_user.tenant_id,
            )
        )
        offer_att = offer_att_result.scalar_one_or_none()
        if offer_att:
            placement_id = offer_att.placement_id
            # Preserve exam data before deleting
            exam_data = {
                "exam_mode": offer_att.exam_mode,
                "exam_language": offer_att.exam_language,
                "extra_time": offer_att.extra_time,
            }
            await db.delete(offer_att)

    # Update status
    att.status = "parked"

    # Build notes: combine reason + exam data so reassignment can restore it
    notes_obj: dict = {}
    if data.reason:
        notes_obj["reason"] = data.reason
    if exam_data and any(v for v in exam_data.values()):
        notes_obj["exam_data"] = exam_data
    notes_str = json.dumps(notes_obj) if notes_obj else data.reason

    # Create history event
    history = TrainingAttendeeHistory(
        tenant_id=current_user.tenant_id,
        attendee_id=att.id,
        event_type="parked",
        placement_id=placement_id,
        source_type=data.source_type,
        source_id=source_uuid,
        notes=notes_str,
        created_by=current_user.user_id,
    )
    db.add(history)
    await db.commit()

    return {"id": str(att.id), "status": att.status}


# ── Reassign endpoint ─────────────────────────────────────────────────────────


@router.post("/{attendee_id}/reassign")
async def reassign_attendee(
    attendee_id: UUID,
    data: ReassignRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Reassign a parked attendee to a new training with invoice transfer."""

    tenant_id = current_user.tenant_id

    result = await db.execute(
        select(TrainingAttendee)
        .options(selectinload(TrainingAttendee.history))
        .where(TrainingAttendee.id == attendee_id, TrainingAttendee.tenant_id == tenant_id)
    )
    att = result.scalars().unique().first()
    if not att:
        raise NotFoundError("Attendee not found")
    if att.status != "parked":
        raise HTTPException(status_code=422, detail="Only parked attendees can be reassigned.")

    placement_uuid = UUID(data.placement_id)
    new_training_name = await _get_training_name_for_placement(db, placement_uuid)

    # Find old registration + invoice via park history
    park_event = next((h for h in att.history if h.event_type == "parked"), None)
    old_registration = None
    old_invoice = None
    if park_event and park_event.source_type == "registration":
        old_registration = await find_old_registration(db, park_event, att, tenant_id)
    if old_registration:
        old_invoice = await find_old_invoice(db, old_registration.id, tenant_id)

    # Cancel old invoice + credit note
    credit_note = None
    if old_invoice:
        credit_note = await cancel_old_invoice_with_credit_note(
            db,
            old_invoice,
            tenant_id,
            f"Attendee {att.first_name} {att.last_name} reassigned to {new_training_name}",
        )

    # Clean up empty old registration
    if old_registration:
        await cleanup_empty_registration(db, old_registration)

    # Create new registration + add attendee
    new_registration = create_new_registration(tenant_id, placement_uuid, old_registration, att)
    db.add(new_registration)
    await db.flush()

    # Restore exam data from park history event (saved during parking)
    exam_mode = None
    exam_language = None
    extra_time = False
    if park_event and park_event.notes:
        try:
            notes_obj = json.loads(park_event.notes)
            ed = notes_obj.get("exam_data", {})
            exam_mode = ed.get("exam_mode")
            exam_language = ed.get("exam_language")
            extra_time = bool(ed.get("extra_time", False))
        except (json.JSONDecodeError, AttributeError):
            pass  # notes is plain text (old format), no exam data

    new_reg_att = TrainingRegistrationAttendee(
        tenant_id=tenant_id,
        registration_id=new_registration.id,
        attendee_id=att.id,
        first_name=att.first_name,
        last_name=att.last_name,
        email=att.email,
        exam_mode=exam_mode,
        exam_language=exam_language,
        extra_time=extra_time,
    )
    db.add(new_reg_att)

    # Create replacement invoice (with payment transfer if paid)
    new_invoice = None
    old_was_paid = old_invoice.status == "paid" if old_invoice else False
    if old_invoice:
        new_invoice = await create_replacement_invoice(
            db,
            tenant_id,
            old_invoice,
            new_registration.id,
            new_training_name,
            att,
        )

    if old_was_paid:
        new_registration.status = "paid"

    att.status = "active"

    reassign_note = data.notes or f"Reassigned to {new_training_name}"
    if old_was_paid:
        reassign_note += " (payment transferred from original invoice)"
    db.add(
        TrainingAttendeeHistory(
            tenant_id=tenant_id,
            attendee_id=att.id,
            event_type="reassigned",
            placement_id=placement_uuid,
            source_type="registration",
            notes=reassign_note,
            created_by=current_user.user_id,
        )
    )

    await db.commit()

    # Send email
    tenant = await db.get(Tenant, tenant_id)
    if tenant and new_invoice and new_invoice.recipient_email:
        try:
            await send_training_invoice_email(db, new_invoice, None, tenant)
        except Exception as exc:
            logger.warning("Failed to send new invoice email for reassignment: %s", exc)

    return {
        "id": str(att.id),
        "status": att.status,
        "new_registration_id": str(new_registration.id),
        "cancelled_invoice": str(old_invoice.id) if old_invoice else None,
        "credit_note_id": str(credit_note.id) if credit_note else None,
        "new_invoice_id": str(new_invoice.id) if new_invoice else None,
    }
