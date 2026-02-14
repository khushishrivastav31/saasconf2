"""Program day endpoints."""

from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip, require_module
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.program import ProgramDay
from app.schemas.program import (
    ProgramDayCreate,
    ProgramDayListResponse,
    ProgramDayResponse,
    ProgramDaysGenerateRequest,
    ProgramDaysGenerateResponse,
    ProgramDayUpdate,
)

from ._shared import MODULE_CODE, _build_day_response, _check_admin_access, _get_conference_for_tenant

router = APIRouter()


@router.get(
    "/days",
    response_model=ProgramDayListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_days(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ProgramDayListResponse:
    """List all program days for a conference."""
    await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ProgramDay)
        .where(
            ProgramDay.conference_id == conference_id,
            ProgramDay.tenant_id == current_user.tenant_id,
        )
        .order_by(ProgramDay.sort_order, ProgramDay.date)
    )
    days = result.scalars().all()

    return ProgramDayListResponse(
        items=[_build_day_response(d) for d in days],
        total=len(days),
    )


@router.post(
    "/days",
    response_model=ProgramDayResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_day(
    conference_id: UUID,
    day_data: ProgramDayCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramDayResponse:
    """Create a new program day."""
    await _check_admin_access(db, current_user, conference_id)
    conference = await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Check for duplicate date
    existing = await db.execute(
        select(ProgramDay).where(
            ProgramDay.conference_id == conference_id,
            ProgramDay.date == day_data.date,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A day with date {day_data.date} already exists")

    day = ProgramDay(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        date=day_data.date,
        name=day_data.name,
        sort_order=day_data.sort_order,
    )
    db.add(day)
    await db.flush()  # Flush to get the ID

    # Audit log
    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="program_day.create",
            resource_type="program_day",
            resource_id=str(day.id),
            details={"date": str(day_data.date), "name": day_data.name},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()
    await db.refresh(day)
    return _build_day_response(day)


@router.post(
    "/days/generate",
    response_model=ProgramDaysGenerateResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def generate_days(
    conference_id: UUID,
    gen_data: ProgramDaysGenerateRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramDaysGenerateResponse:
    """Auto-generate program days from conference start/end dates."""
    await _check_admin_access(db, current_user, conference_id)
    conference = await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    if not conference.start_date or not conference.end_date:
        raise ValidationError("Conference must have start_date and end_date set")

    # Calculate date range
    start = conference.start_date
    end = conference.end_date

    if gen_data.include_pre_conference:
        start = start - timedelta(days=1)
    if gen_data.include_post_conference:
        end = end + timedelta(days=1)

    # Get existing days
    existing_result = await db.execute(
        select(ProgramDay.date).where(ProgramDay.conference_id == conference_id)
    )
    existing_dates = {row[0] for row in existing_result.all()}

    # Create missing days
    created = []
    skipped = 0
    current_date = start
    sort_order = 0

    while current_date <= end:
        if current_date in existing_dates:
            skipped += 1
        else:
            day = ProgramDay(
                tenant_id=current_user.tenant_id,
                conference_id=conference.id,
                date=current_date,
                name=None,
                sort_order=sort_order,
            )
            db.add(day)
            created.append(day)
        current_date += timedelta(days=1)
        sort_order += 1

    if created:
        # Audit log
        db.add(
            AuditLog(
                tenant_id=current_user.tenant_id,
                user_id=current_user.user_id,
                action="program_day.generate",
                resource_type="program_day",
                resource_id=str(conference_id),
                details={"created_count": len(created), "skipped_count": skipped},
                ip_address=get_client_ip(request),
                user_agent=request.headers.get("user-agent"),
            )
        )
        await db.commit()
        for day in created:
            await db.refresh(day)

    return ProgramDaysGenerateResponse(
        created=[_build_day_response(d) for d in created],
        skipped=skipped,
    )


@router.put(
    "/days/{day_id}",
    response_model=ProgramDayResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_day(
    conference_id: UUID,
    day_id: UUID,
    day_data: ProgramDayUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ProgramDayResponse:
    """Update a program day."""
    await _check_admin_access(db, current_user, conference_id)
    await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ProgramDay).where(
            ProgramDay.id == day_id,
            ProgramDay.conference_id == conference_id,
            ProgramDay.tenant_id == current_user.tenant_id,
        )
    )
    day = result.scalar_one_or_none()
    if not day:
        raise NotFoundError(f"Program day with ID '{day_id}' not found")

    if day_data.date is not None:
        # Check for duplicate date
        existing = await db.execute(
            select(ProgramDay).where(
                ProgramDay.conference_id == conference_id,
                ProgramDay.date == day_data.date,
                ProgramDay.id != day_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"A day with date {day_data.date} already exists")
        day.date = day_data.date

    if day_data.name is not None:
        day.name = day_data.name
    if day_data.sort_order is not None:
        day.sort_order = day_data.sort_order

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="program_day.update",
            resource_type="program_day",
            resource_id=str(day_id),
            details=day_data.model_dump(mode="json", exclude_unset=True),
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.commit()
    await db.refresh(day)
    return _build_day_response(day)


@router.delete(
    "/days/{day_id}",
    status_code=204,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_day(
    conference_id: UUID,
    day_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> None:
    """Delete a program day and all its time slots and sessions."""
    await _check_admin_access(db, current_user, conference_id)
    await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ProgramDay).where(
            ProgramDay.id == day_id,
            ProgramDay.conference_id == conference_id,
            ProgramDay.tenant_id == current_user.tenant_id,
        )
    )
    day = result.scalar_one_or_none()
    if not day:
        raise NotFoundError(f"Program day with ID '{day_id}' not found")

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="program_day.delete",
            resource_type="program_day",
            resource_id=str(day_id),
            details={"date": str(day.date)},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    )

    await db.delete(day)
    await db.commit()
