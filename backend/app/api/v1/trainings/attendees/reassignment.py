"""Training attendees — reassignment and available-placements endpoints."""

import json
import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
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
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_attendee_history import TrainingAttendeeHistory
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistrationAttendee

from ._helpers import get_training_name_for_placement

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/attendees", tags=["training-attendees"])


class ReassignRequest(BaseModel):
    placement_id: str
    notes: str | None = None
    keep_invoice: bool = False  # If True: skip credit note + new invoice, leave existing invoice untouched


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
    new_training_name = await get_training_name_for_placement(db, placement_uuid)

    park_event = next((h for h in att.history if h.event_type == "parked"), None)
    old_registration = None
    old_invoice = None
    if park_event and park_event.source_type == "registration":
        old_registration = await find_old_registration(db, park_event, att, tenant_id)
    if old_registration:
        old_invoice = await find_old_invoice(db, old_registration.id, tenant_id)

    credit_note = None
    if old_invoice and not data.keep_invoice:
        credit_note = await cancel_old_invoice_with_credit_note(
            db,
            old_invoice,
            tenant_id,
            f"Attendee {att.first_name} {att.last_name} reassigned to {new_training_name}",
        )

    # keep_invoice mode: reuse the old (now-empty) registration by repointing its placement so
    # the existing invoice stays attached; if the old reg has other attendees, fall back to
    # creating a new registration without an invoice.
    reused_old_registration = False
    if data.keep_invoice and old_registration:
        remaining_q = await db.execute(
            select(func.count(TrainingRegistrationAttendee.id)).where(
                TrainingRegistrationAttendee.registration_id == old_registration.id
            )
        )
        if (remaining_q.scalar() or 0) == 0:
            old_registration.placement_id = placement_uuid
            new_registration = old_registration
            reused_old_registration = True

    if not reused_old_registration:
        if not data.keep_invoice and old_registration:
            await cleanup_empty_registration(db, old_registration)
        new_registration = create_new_registration(tenant_id, placement_uuid, old_registration, att)
        db.add(new_registration)
        await db.flush()

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

    new_invoice = None
    old_was_paid = old_invoice.status == "paid" if old_invoice else False
    if old_invoice and not data.keep_invoice:
        new_invoice = await create_replacement_invoice(
            db,
            tenant_id,
            old_invoice,
            new_registration.id,
            new_training_name,
            att,
        )

    if old_was_paid and not data.keep_invoice:
        new_registration.status = "paid"

    att.status = "active"

    if data.keep_invoice:
        reassign_note = data.notes or f"Reassigned to {new_training_name} (invoice unchanged)"
    else:
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

    tenant = await db.get(Tenant, tenant_id)
    if tenant and new_invoice and new_invoice.recipient_email and not data.keep_invoice:
        try:
            await send_training_invoice_email(db, new_invoice, None, tenant)
        except Exception as exc:
            logger.warning("Failed to send new invoice email for reassignment: %s", exc)

    return {
        "id": str(att.id),
        "status": att.status,
        "new_registration_id": str(new_registration.id),
        "cancelled_invoice": str(old_invoice.id) if old_invoice and not data.keep_invoice else None,
        "credit_note_id": str(credit_note.id) if credit_note else None,
        "new_invoice_id": str(new_invoice.id) if new_invoice else None,
        "kept_invoice_id": str(old_invoice.id) if old_invoice and data.keep_invoice else None,
    }
