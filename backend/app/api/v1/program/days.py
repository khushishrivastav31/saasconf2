"""Program day endpoints."""

from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select

from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip, require_module
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.program import ProgramDay
from app.models.settings import BookingOption
from app.schemas.program import (
    ProgramDayCreate,
    ProgramDayListResponse,
    ProgramDayResponse,
    ProgramDaysGenerateRequest,
    ProgramDaysGenerateResponse,
    ProgramDayUpdate,
)

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant

from ._shared import MODULE_CODE, _build_day_response

router = APIRouter()


async def _auto_create_booking_option(db: DbSessionDep, day: ProgramDay) -> None:
    """Auto-create a booking option linked to a new program day.

    Booking options define the display name for conference days.
    When a day is created, the corresponding option should exist automatically.
    """
    # Check if an option already exists for this day
    existing = await db.execute(
        select(BookingOption).where(
            BookingOption.conference_day_id == day.id,
        )
    )
    if existing.scalar_one_or_none():
        return

    name = day.name or str(day.date)

    # Check if an option with this name already exists (unique constraint)
    name_check = await db.execute(
        select(BookingOption).where(
            BookingOption.conference_id == day.conference_id,
            BookingOption.tenant_id == day.tenant_id,
            BookingOption.name == name,
        )
    )
    existing_opt = name_check.scalar_one_or_none()
    if existing_opt:
        # Link existing unlinked option to this day
        if not existing_opt.conference_day_id:
            existing_opt.conference_day_id = day.id
        return

    # Get next sort order
    max_sort = await db.execute(
        select(BookingOption.sort_order)
        .where(
            BookingOption.conference_id == day.conference_id,
            BookingOption.tenant_id == day.tenant_id,
        )
        .order_by(BookingOption.sort_order.desc())
        .limit(1)
    )
    row = max_sort.scalar_one_or_none()
    next_sort = (row + 1) if row is not None else 0

    option = BookingOption(
        tenant_id=day.tenant_id,
        conference_id=day.conference_id,
        name=name,
        conference_day_id=day.id,
        sort_order=next_sort,
    )
    db.add(option)


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
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

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
    await check_conference_admin(conference_id, current_user, db)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

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

    # Auto-create linked booking option
    await _auto_create_booking_option(db, day)

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
    await check_conference_admin(conference_id, current_user, db)
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

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
        await db.flush()
        # Auto-create linked booking options for all new days
        for day in created:
            await _auto_create_booking_option(db, day)

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
    await check_conference_admin(conference_id, current_user, db)
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

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

    # Sync name change to the linked booking option
    if day_data.name is not None:
        opt_result = await db.execute(
            select(BookingOption).where(BookingOption.conference_day_id == day.id)
        )
        linked_opt = opt_result.scalar_one_or_none()
        if linked_opt and linked_opt.name != day.name:
            linked_opt.name = day.name

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
    await check_conference_admin(conference_id, current_user, db)
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

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
