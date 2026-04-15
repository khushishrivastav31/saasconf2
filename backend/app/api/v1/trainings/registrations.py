"""Training registrations admin endpoints."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError
from app.models.customer import Customer
from app.models.customer_offer import CustomerOffer
from app.models.offer_attendee import OfferAttendee
from app.models.training import Training
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee

router = APIRouter(prefix="/registrations", tags=["training-registrations"])


@router.get("")
async def list_training_registrations(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    status: str | None = Query(None),
    placement_id: UUID | None = Query(None),
    search: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> dict:
    """List training registrations with filtering and pagination."""
    query = (
        select(TrainingRegistration)
        .where(TrainingRegistration.tenant_id == current_user.tenant_id)
        .options(
            joinedload(TrainingRegistration.attendees),
            joinedload(TrainingRegistration.invoice),
        )
    )

    if status:
        query = query.where(TrainingRegistration.status == status)
    if placement_id:
        query = query.where(TrainingRegistration.placement_id == placement_id)

    # Search — contact name/email/company + training name
    if search:
        search_lower = search.lower()
        # Sub-query: placement IDs whose training name matches
        training_match_q = (
            select(ProgramYearTraining.id)
            .join(Training, ProgramYearTraining.training_id == Training.id)
            .where(func.lower(Training.name).contains(search_lower))
        )
        query = query.where(
            func.lower(TrainingRegistration.contact_first_name).contains(search_lower)
            | func.lower(TrainingRegistration.contact_last_name).contains(search_lower)
            | func.lower(TrainingRegistration.contact_email).contains(search_lower)
            | func.lower(TrainingRegistration.company_name).contains(search_lower)
            | TrainingRegistration.placement_id.in_(training_match_q)
        )

    # Date filters — filter on placement start_date
    if date_from or date_to:
        placement_date_q = select(ProgramYearTraining.id).where(ProgramYearTraining.tenant_id == current_user.tenant_id)
        if date_from:
            placement_date_q = placement_date_q.where(ProgramYearTraining.start_date >= date.fromisoformat(date_from))
        if date_to:
            placement_date_q = placement_date_q.where(ProgramYearTraining.start_date <= date.fromisoformat(date_to))
        query = query.where(TrainingRegistration.placement_id.in_(placement_date_q))

    # Count
    count_q = select(func.count()).select_from(query.with_only_columns(TrainingRegistration.id).subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Paginate
    query = query.order_by(TrainingRegistration.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    registrations = result.scalars().unique().all()

    # Get training names + is_guaranteed for placements
    placement_ids = {r.placement_id for r in registrations}
    training_info: dict[UUID, dict] = {}
    if placement_ids:
        p_result = await db.execute(
            select(
                ProgramYearTraining.id,
                Training.name,
                ProgramYearTraining.start_date,
                ProgramYearTraining.is_guaranteed,
            )
            .join(Training, ProgramYearTraining.training_id == Training.id)
            .where(ProgramYearTraining.id.in_(placement_ids))
        )
        for pid, tname, sdate, guaranteed in p_result.all():
            training_info[pid] = {
                "name": tname,
                "start_date": sdate.isoformat() if sdate else None,
                "is_guaranteed": guaranteed or False,
            }

    items = []
    for reg in registrations:
        placement_data = training_info.get(reg.placement_id, {})
        items.append(
            {
                "id": str(reg.id),
                "placement_id": str(reg.placement_id),
                "training_name": placement_data.get("name", "Unknown"),
                "training_date": placement_data.get("start_date"),
                "is_guaranteed": placement_data.get("is_guaranteed", False),
                "status": reg.status,
                "contact_first_name": reg.contact_first_name,
                "contact_last_name": reg.contact_last_name,
                "contact_email": reg.contact_email,
                "company_name": reg.company_name,
                "payment_method": reg.payment_method,
                "invoice_status": reg.invoice.status if reg.invoice else None,
                "invoice_number": reg.invoice.invoice_number if reg.invoice else None,
                "subtotal": str(reg.subtotal) if reg.subtotal else None,
                "vat_amount": str(reg.vat_amount) if reg.vat_amount else None,
                "total": str(reg.total) if reg.total else None,
                "currency": reg.currency,
                "language": reg.language,
                "attendee_count": len(reg.attendees),
                "created_at": reg.created_at.isoformat() if reg.created_at else None,
                "attendees": [
                    {
                        "id": str(a.id),
                        "first_name": a.first_name,
                        "last_name": a.last_name,
                        "email": a.email,
                        "include_exam": a.include_exam,
                        "exam_mode": a.exam_mode,
                        "exam_language": a.exam_language,
                        "extra_time": a.extra_time,
                    }
                    for a in reg.attendees
                ],
            }
        )

    # ── Offer attendees (from accepted offers) ──────────────────────────────────
    oa_query = (
        select(OfferAttendee, CustomerOffer.offer_number, CustomerOffer.customer_id)
        .join(CustomerOffer, OfferAttendee.offer_id == CustomerOffer.id)
        .where(
            OfferAttendee.tenant_id == current_user.tenant_id,
            CustomerOffer.status == "accepted",
        )
    )
    if placement_id:
        oa_query = oa_query.where(OfferAttendee.placement_id == placement_id)

    oa_result = await db.execute(oa_query.order_by(OfferAttendee.created_at))
    offer_attendee_rows = oa_result.all()

    # Enrich with training info for any new placement IDs
    oa_placement_ids = {row[0].placement_id for row in offer_attendee_rows if row[0].placement_id} - set(
        training_info.keys()
    )
    if oa_placement_ids:
        oa_t = await db.execute(
            select(
                ProgramYearTraining.id, Training.name, ProgramYearTraining.start_date, ProgramYearTraining.is_guaranteed
            )
            .join(Training, ProgramYearTraining.training_id == Training.id)
            .where(ProgramYearTraining.id.in_(oa_placement_ids))
        )
        for pid, tname, sdate, guaranteed in oa_t.all():
            training_info[pid] = {
                "name": tname,
                "start_date": sdate.isoformat() if sdate else None,
                "is_guaranteed": guaranteed or False,
            }

    # Get customer names
    customer_ids = {row[2] for row in offer_attendee_rows}
    customer_names: dict[UUID, str] = {}
    if customer_ids:
        cn_result = await db.execute(select(Customer.id, Customer.name).where(Customer.id.in_(customer_ids)))
        customer_names = {cid: cname for cid, cname in cn_result.all()}

    offer_attendees = []
    for att, offer_number, customer_id in offer_attendee_rows:
        if not att.placement_id:
            continue
        pinfo = training_info.get(att.placement_id, {})
        offer_attendees.append(
            {
                "id": str(att.id),
                "placement_id": str(att.placement_id),
                "training_name": pinfo.get("name", "Unknown"),
                "training_date": pinfo.get("start_date"),
                "is_guaranteed": pinfo.get("is_guaranteed", False),
                "first_name": att.first_name,
                "last_name": att.last_name,
                "email": att.email,
                "offer_id": str(att.offer_id),
                "offer_number": offer_number,
                "customer_id": str(customer_id),
                "customer_name": customer_names.get(customer_id, "—"),
                "certification": att.certification,
                "exam_mode": att.exam_mode,
                "exam_language": att.exam_language,
                "extra_time": att.extra_time,
            }
        )

    return {"items": items, "offer_attendees": offer_attendees, "total": total, "page": page, "per_page": per_page}


@router.get("/{registration_id}")
async def get_training_registration(
    registration_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Get a single training registration with attendees."""
    result = await db.execute(
        select(TrainingRegistration)
        .options(joinedload(TrainingRegistration.attendees))
        .where(
            TrainingRegistration.id == registration_id,
            TrainingRegistration.tenant_id == current_user.tenant_id,
        )
    )
    reg = result.scalars().unique().first()
    if not reg:
        raise NotFoundError("Registration not found")

    return {
        "id": str(reg.id),
        "placement_id": str(reg.placement_id),
        "status": reg.status,
        "language": reg.language,
        "company_name": reg.company_name,
        "street": reg.street,
        "postal_code": reg.postal_code,
        "city": reg.city,
        "country": reg.country,
        "vat_number": reg.vat_number,
        "contact_first_name": reg.contact_first_name,
        "contact_last_name": reg.contact_last_name,
        "contact_email": reg.contact_email,
        "contact_phone": reg.contact_phone,
        "payment_method": reg.payment_method,
        "subtotal": str(reg.subtotal) if reg.subtotal else None,
        "vat_amount": str(reg.vat_amount) if reg.vat_amount else None,
        "total": str(reg.total) if reg.total else None,
        "currency": reg.currency,
        "created_at": reg.created_at.isoformat() if reg.created_at else None,
        "attendees": [
            {
                "id": str(a.id),
                "first_name": a.first_name,
                "last_name": a.last_name,
                "email": a.email,
                "include_exam": a.include_exam,
                "exam_mode": a.exam_mode,
                "exam_language": a.exam_language,
                "extra_time": a.extra_time,
            }
            for a in reg.attendees
        ],
    }


class UpdateAttendeeRequest(BaseModel):
    exam_mode: str | None = None
    exam_language: str | None = None
    extra_time: bool | None = None
    include_exam: bool | None = None


@router.patch("/{registration_id}/attendees/{attendee_id}")
async def update_registration_attendee(
    registration_id: UUID,
    attendee_id: UUID,
    data: UpdateAttendeeRequest,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Update exam fields on a training registration attendee."""
    result = await db.execute(
        select(TrainingRegistrationAttendee).where(
            TrainingRegistrationAttendee.id == attendee_id,
            TrainingRegistrationAttendee.registration_id == registration_id,
            TrainingRegistrationAttendee.tenant_id == current_user.tenant_id,
        )
    )
    att = result.scalar_one_or_none()
    if not att:
        raise NotFoundError("Attendee not found")

    update_fields = data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        setattr(att, field, value)

    await db.commit()
    await db.refresh(att)

    return {
        "id": str(att.id),
        "first_name": att.first_name,
        "last_name": att.last_name,
        "email": att.email,
        "include_exam": att.include_exam,
        "exam_mode": att.exam_mode,
        "exam_language": att.exam_language,
        "extra_time": att.extra_time,
    }
