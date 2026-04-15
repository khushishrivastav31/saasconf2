"""Training attendees — central identity, parking lot, and history endpoints."""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError
from app.models.offer_attendee import OfferAttendee
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
    if placement_ids:
        tn_result = await db.execute(
            select(ProgramYearTraining.id, Training.name, ProgramYearTraining.start_date)
            .join(Training, ProgramYearTraining.training_id == Training.id)
            .where(ProgramYearTraining.id.in_(placement_ids))
        )
        for pid, tname, sdate in tn_result.all():
            date_str = sdate.strftime("%d.%m.%Y") if sdate else ""
            training_names[pid] = f"{tname} ({date_str})" if date_str else tname

    items = []
    for att in attendees:
        # Latest history event
        latest = att.history[0] if att.history else None
        current_training = "—"
        if latest and latest.event_type in ("registered", "reassigned", "offer_assigned") and latest.placement_id:
            current_training = training_names.get(latest.placement_id, "—")

        items.append(
            {
                "id": str(att.id),
                "first_name": att.first_name,
                "last_name": att.last_name,
                "email": att.email,
                "status": att.status,
                "notes": att.notes,
                "current_training": current_training,
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
            await db.delete(offer_att)

    # Update status
    att.status = "parked"

    # Create history event
    history = TrainingAttendeeHistory(
        tenant_id=current_user.tenant_id,
        attendee_id=att.id,
        event_type="parked",
        placement_id=placement_id,
        source_type=data.source_type,
        source_id=source_uuid,
        notes=data.reason,
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
    """Reassign a parked attendee to a new training.

    Full flow:
    1. Find old registration (from park history) and its invoice
    2. Cancel old invoice → create credit note
    3. Create new registration on target placement (copy billing from old)
    4. Add attendee to new registration
    5. Create new invoice (same price, new training) → sent + emailed
    6. Send credit note email too
    """
    from datetime import date as date_type
    from datetime import timedelta

    from app.core.training_invoice_number import generate_training_invoice_number
    from app.models.tenant import Tenant
    from app.models.training_invoice import TrainingInvoice

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

    # Get new training name
    new_training_name = await _get_training_name_for_placement(db, placement_uuid)

    # Find the park event to trace back to the old registration
    # source_id stores the registration_id (set during parking)
    park_event = next((h for h in att.history if h.event_type == "parked"), None)
    old_registration: TrainingRegistration | None = None
    old_invoice: TrainingInvoice | None = None

    if park_event and park_event.source_type == "registration" and park_event.source_id:
        # source_id stores registration_id (new code) or attendee row ID (legacy)
        # Try as registration_id first
        reg_q = await db.execute(
            select(TrainingRegistration).where(
                TrainingRegistration.id == park_event.source_id,
                TrainingRegistration.tenant_id == tenant_id,
            )
        )
        old_registration = reg_q.scalar_one_or_none()

        # Fallback: find registration by contact email matching the attendee
        if not old_registration and park_event.placement_id:
            reg_q2 = await db.execute(
                select(TrainingRegistration).where(
                    TrainingRegistration.placement_id == park_event.placement_id,
                    TrainingRegistration.tenant_id == tenant_id,
                    TrainingRegistration.contact_email == att.email,
                )
            )
            old_registration = reg_q2.scalar_one_or_none()

            # Last resort: find by placement + contact name
            if not old_registration:
                reg_q3 = await db.execute(
                    select(TrainingRegistration)
                    .where(
                        TrainingRegistration.placement_id == park_event.placement_id,
                        TrainingRegistration.tenant_id == tenant_id,
                    )
                    .order_by(TrainingRegistration.created_at.desc())
                    .limit(1)
                )
                old_registration = reg_q3.scalar_one_or_none()

    # Find old invoice from the old registration (most recent non-cancelled)
    if old_registration:
        inv_q = await db.execute(
            select(TrainingInvoice)
            .where(
                TrainingInvoice.training_registration_id == old_registration.id,
                TrainingInvoice.tenant_id == tenant_id,
                TrainingInvoice.status.in_(["sent", "paid", "overdue"]),
                TrainingInvoice.template_type != "credit_note",
            )
            .order_by(TrainingInvoice.created_at.desc())
            .limit(1)
        )
        old_invoice = inv_q.scalar_one_or_none()

    # ── Cancel old invoice + credit note ──────────────────────────────────
    credit_note: TrainingInvoice | None = None
    if old_invoice:
        try:
            from app.api.v1.trainings.invoices import _build_credit_note

            old_invoice.status = "cancelled"
            cn_number = await generate_training_invoice_number(db, tenant_id)
            credit_note = _build_credit_note(
                old_invoice,
                tenant_id,
                cn_number,
                f"Attendee {att.first_name} {att.last_name} reassigned to {new_training_name}",
            )
            db.add(credit_note)
        except Exception as exc:
            logger.warning("Failed to cancel old invoice during reassignment: %s", exc)

    # ── Clean up old registration if empty ────────────────────────────────
    if old_registration:
        remaining_q = await db.execute(
            select(func.count(TrainingRegistrationAttendee.id)).where(
                TrainingRegistrationAttendee.registration_id == old_registration.id
            )
        )
        remaining_count = remaining_q.scalar() or 0
        if remaining_count == 0:
            # Unlink invoices from the old registration before deleting
            await db.execute(
                select(TrainingInvoice)  # just to import the model in context
            )
            from sqlalchemy import update

            await db.execute(
                update(TrainingInvoice)
                .where(TrainingInvoice.training_registration_id == old_registration.id)
                .values(training_registration_id=None)
            )
            await db.delete(old_registration)
            logger.info("Deleted empty old registration %s after reassignment", old_registration.id)

    # ── Create new registration on target placement ───────────────────────
    new_registration = TrainingRegistration(
        tenant_id=tenant_id,
        placement_id=placement_uuid,
        status="registered",
        contact_first_name=old_registration.contact_first_name if old_registration else att.first_name,
        contact_last_name=old_registration.contact_last_name if old_registration else att.last_name,
        contact_email=old_registration.contact_email if old_registration else att.email,
        contact_phone=old_registration.contact_phone if old_registration else None,
        company_name=old_registration.company_name if old_registration else None,
        street=old_registration.street if old_registration else None,
        postal_code=old_registration.postal_code if old_registration else None,
        city=old_registration.city if old_registration else None,
        country=old_registration.country if old_registration else None,
        vat_number=old_registration.vat_number if old_registration else None,
        payment_method=old_registration.payment_method if old_registration else "bank_transfer",
        subtotal=old_registration.subtotal if old_registration else None,
        vat_amount=old_registration.vat_amount if old_registration else None,
        total=old_registration.total if old_registration else None,
        currency=old_registration.currency if old_registration else "EUR",
    )
    db.add(new_registration)
    await db.flush()

    # Add attendee to new registration
    new_reg_att = TrainingRegistrationAttendee(
        tenant_id=tenant_id,
        registration_id=new_registration.id,
        attendee_id=att.id,
        first_name=att.first_name,
        last_name=att.last_name,
        email=att.email,
    )
    db.add(new_reg_att)

    # ── Create new invoice (same price as old) ────────────────────────────
    # If old invoice was paid → new invoice is auto-marked paid (payment transferred, no refund)
    new_invoice: TrainingInvoice | None = None
    old_was_paid = old_invoice.status == "paid" if old_invoice else False
    if old_invoice:
        try:
            new_inv_number = await generate_training_invoice_number(db, tenant_id)
            today = date_type.today()

            # Copy line items but update training name
            new_line_items = []
            for item in old_invoice.line_items or []:
                new_item = dict(item)
                new_item["description"] = f"{new_training_name} (1 attendee)"
                new_line_items.append(new_item)
                break  # Only first line item (training), keep exam items as-is
            for item in (old_invoice.line_items or [])[1:]:
                new_line_items.append(dict(item))

            # Build payment history note
            payment_note = f"Reassignment of {att.first_name} {att.last_name} to {new_training_name}"
            if old_was_paid:
                paid_date = old_invoice.issue_date.strftime("%d.%m.%Y") if old_invoice.issue_date else "unknown date"
                payment_note += (
                    f"\n\nPayment transferred from cancelled invoice {old_invoice.invoice_number}."
                    f"\nOriginal payment: {old_invoice.currency} {old_invoice.total} "
                    f"via {old_invoice.payment_method or 'unknown'} on {paid_date}."
                )
                if old_invoice.stripe_payment_intent_id:
                    payment_note += f"\nStripe Payment Intent: {old_invoice.stripe_payment_intent_id}"

            new_invoice = TrainingInvoice(
                tenant_id=tenant_id,
                training_registration_id=new_registration.id,
                invoice_number=new_inv_number,
                template_type=old_invoice.template_type,
                status="paid" if old_was_paid else "sent",
                issue_date=today,
                due_date=today + timedelta(days=30) if not old_was_paid else today,
                recipient_name=old_invoice.recipient_name,
                recipient_email=old_invoice.recipient_email,
                recipient_address_line1=old_invoice.recipient_address_line1,
                recipient_city=old_invoice.recipient_city,
                recipient_postal_code=old_invoice.recipient_postal_code,
                recipient_country=old_invoice.recipient_country,
                recipient_vat_number=old_invoice.recipient_vat_number,
                payment_method=old_invoice.payment_method,
                stripe_payment_intent_id=old_invoice.stripe_payment_intent_id if old_was_paid else None,
                po_number=old_invoice.po_number,
                line_items=new_line_items,
                subtotal=old_invoice.subtotal,
                tax_rate=old_invoice.tax_rate,
                tax_amount=old_invoice.tax_amount,
                total=old_invoice.total,
                currency=old_invoice.currency,
                notes=payment_note,
                language=old_invoice.language,
            )
            db.add(new_invoice)
        except Exception as exc:
            logger.warning("Failed to create new invoice during reassignment: %s", exc)

    # Update registration status if payment transferred
    if old_was_paid:
        new_registration.status = "paid"

    # Update attendee status
    att.status = "active"

    # Create history event
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

    # ── Send emails ───────────────────────────────────────────────────────
    tenant = await db.get(Tenant, tenant_id)
    if tenant and new_invoice and new_invoice.recipient_email:
        try:
            from app.core.training_registration_emails import send_training_invoice_email

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
