"""Training attendees — list, detail, and backfill endpoints."""

from uuid import UUID

from fastapi import APIRouter, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import selectinload

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.exceptions import NotFoundError
from app.models.offer_attendee import OfferAttendee
from app.models.portal_user import PortalUser
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_attendee_history import TrainingAttendeeHistory
from app.models.training_program import ProgramYearTraining
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee

from ._helpers import get_or_create_central_attendee

router = APIRouter(prefix="/attendees", tags=["training-attendees"])


@router.post("/backfill")
async def backfill_central_attendees(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Backfill central TrainingAttendee records from existing registration + offer attendees."""
    tenant_id = current_user.tenant_id
    created = 0
    linked = 0

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
        if att.created_at == att.updated_at:
            created += 1
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


@router.get("")
async def list_attendees(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    status: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> dict:
    """List all central training attendees with latest history event.

    Effective status treats a parked attendee whose portal account has been
    deactivated (``portal_users.is_active = False``) as ``inactive``. This keeps
    the parking lot and the status filter in sync with the portal-account state
    without requiring a data migration for historical rows.
    """
    query = select(TrainingAttendee).where(TrainingAttendee.tenant_id == current_user.tenant_id)

    if status and status != "all":
        if status == "parked":
            query = query.outerjoin(PortalUser, TrainingAttendee.portal_user_id == PortalUser.id).where(
                TrainingAttendee.status == "parked",
                or_(PortalUser.id.is_(None), PortalUser.is_active.is_(True)),
            )
        elif status == "inactive":
            query = query.outerjoin(PortalUser, TrainingAttendee.portal_user_id == PortalUser.id).where(
                or_(
                    TrainingAttendee.status == "inactive",
                    and_(TrainingAttendee.status == "parked", PortalUser.is_active.is_(False)),
                )
            )
        else:
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

    portal_user_ids = {att.portal_user_id for att in attendees if att.portal_user_id}
    portal_active: dict[UUID, bool] = {}
    if portal_user_ids:
        pu_rows = await db.execute(
            select(PortalUser.id, PortalUser.is_active).where(PortalUser.id.in_(portal_user_ids))
        )
        for pu_id, is_active in pu_rows.all():
            portal_active[pu_id] = bool(is_active)

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
        latest = att.history[0] if att.history else None
        current_training = "—"
        current_training_date: str | None = None
        if latest and latest.event_type in ("registered", "reassigned", "offer_assigned") and latest.placement_id:
            current_training = training_names.get(latest.placement_id, "—")
            current_training_date = training_dates.get(latest.placement_id)

        effective_status = att.status
        if att.status == "parked" and att.portal_user_id is not None and portal_active.get(att.portal_user_id) is False:
            effective_status = "inactive"

        items.append(
            {
                "id": str(att.id),
                "first_name": att.first_name,
                "last_name": att.last_name,
                "email": att.email,
                "status": effective_status,
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

    effective_status = att.status
    if att.status == "parked" and att.portal_user_id is not None:
        pu = await db.get(PortalUser, att.portal_user_id)
        if pu and not pu.is_active:
            effective_status = "inactive"

    return {
        "id": str(att.id),
        "first_name": att.first_name,
        "last_name": att.last_name,
        "email": att.email,
        "status": effective_status,
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
