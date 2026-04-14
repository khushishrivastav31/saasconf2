"""Training registrations admin endpoints."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.models.training import Training
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration

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

    return {"items": items, "total": total, "page": page, "per_page": per_page}


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
        from app.core.exceptions import NotFoundError

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
