"""Booking Periods CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.settings import BookingPeriod
from app.schemas.settings import (
    BookingPeriodCreate,
    BookingPeriodListResponse,
    BookingPeriodResponse,
    BookingPeriodUpdate,
)

from ._shared import _resolve_conference, _check_conference_admin

router = APIRouter()


@router.get("/booking-periods", response_model=BookingPeriodListResponse)
async def list_booking_periods(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BookingPeriodListResponse:
    """List all booking periods for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    query = (
        select(BookingPeriod)
        .where(
            BookingPeriod.conference_id == conference.id,
            BookingPeriod.tenant_id == conference.tenant_id,
        )
        .order_by(BookingPeriod.sort_order, BookingPeriod.name)
    )
    result = await db.execute(query)
    periods = result.scalars().all()

    items = [
        BookingPeriodResponse(
            id=p.id,
            tenant_id=p.tenant_id,
            conference_id=p.conference_id,
            name=p.name,
            start_date=p.start_date,
            end_date=p.end_date,
            sort_order=p.sort_order,
            prices=p.prices,
            currency=p.currency,
            is_active=p.is_active,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in periods
    ]

    return BookingPeriodListResponse(items=items, total=len(items))


@router.post("/booking-periods", response_model=BookingPeriodResponse)
async def create_booking_period(
    conference_id: UUID,
    period_data: BookingPeriodCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> BookingPeriodResponse:
    """Create a new booking period for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    # Check unique name within conference
    existing = await db.execute(
        select(BookingPeriod).where(
            BookingPeriod.conference_id == conference.id,
            BookingPeriod.tenant_id == conference.tenant_id,
            BookingPeriod.name == period_data.name,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A booking period named '{period_data.name}' already exists")

    prices = {k: float(v) for k, v in period_data.prices.items()} if period_data.prices else {}

    period = BookingPeriod(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name=period_data.name,
        start_date=period_data.start_date,
        end_date=period_data.end_date,
        sort_order=period_data.sort_order,
        prices=prices,
        currency=period_data.currency,
        is_active=period_data.is_active,
    )
    db.add(period)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="booking_period.create",
        resource_type="booking_period",
        resource_id=period.id,
        details={"name": period.name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(period)

    return BookingPeriodResponse(
        id=period.id,
        tenant_id=period.tenant_id,
        conference_id=period.conference_id,
        name=period.name,
        start_date=period.start_date,
        end_date=period.end_date,
        sort_order=period.sort_order,
        prices=period.prices,
        currency=period.currency,
        is_active=period.is_active,
        created_at=period.created_at,
        updated_at=period.updated_at,
    )


@router.put("/booking-periods/{period_id}", response_model=BookingPeriodResponse)
async def update_booking_period(
    conference_id: UUID,
    period_id: UUID,
    period_data: BookingPeriodUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> BookingPeriodResponse:
    """Update an existing booking period."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(BookingPeriod).where(
            BookingPeriod.id == period_id,
            BookingPeriod.conference_id == conference.id,
        )
    )
    period = result.scalar_one_or_none()
    if not period:
        raise NotFoundError(f"Booking period with ID '{period_id}' not found")

    # If name is changing, check uniqueness
    if period_data.name is not None and period_data.name != period.name:
        existing = await db.execute(
            select(BookingPeriod).where(
                BookingPeriod.conference_id == conference.id,
                BookingPeriod.tenant_id == conference.tenant_id,
                BookingPeriod.name == period_data.name,
                BookingPeriod.id != period_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"A booking period named '{period_data.name}' already exists")

    update_data = period_data.model_dump(exclude_unset=True)

    # Serialize prices for JSONB storage
    if "prices" in update_data and update_data["prices"] is not None:
        update_data["prices"] = {k: float(v) for k, v in update_data["prices"].items()}

    for field, value in update_data.items():
        setattr(period, field, value)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="booking_period.update",
        resource_type="booking_period",
        resource_id=period.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(period)

    return BookingPeriodResponse(
        id=period.id,
        tenant_id=period.tenant_id,
        conference_id=period.conference_id,
        name=period.name,
        start_date=period.start_date,
        end_date=period.end_date,
        sort_order=period.sort_order,
        prices=period.prices,
        currency=period.currency,
        is_active=period.is_active,
        created_at=period.created_at,
        updated_at=period.updated_at,
    )


@router.delete("/booking-periods/{period_id}")
async def delete_booking_period(
    conference_id: UUID,
    period_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a booking period and clean up dangling references in package prices."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(BookingPeriod).where(
            BookingPeriod.id == period_id,
            BookingPeriod.conference_id == conference.id,
        )
    )
    period = result.scalar_one_or_none()
    if not period:
        raise NotFoundError(f"Booking period with ID '{period_id}' not found")

    period_name = period.name

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="booking_period.delete",
        resource_type="booking_period",
        resource_id=period.id,
        details={"name": period_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(period)
    await db.commit()

    return {"message": f"Booking period '{period_name}' deleted successfully"}
