"""Booking-related helper functions."""

from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.booking import BookingPeriod


async def get_active_booking_period(
    db: AsyncSession,
    conference_id: UUID,
    tenant_id: UUID,
    registration_date: date | None = None,
) -> BookingPeriod | None:
    """Get the active booking period for a conference on a given date.

    Selects the booking period where registration_date falls within the
    start_date/end_date range. If no exact match, falls back to the first
    active period by sort_order.

    Args:
        db: Database session
        conference_id: Conference ID
        tenant_id: Tenant ID
        registration_date: Date to check (defaults to today)

    Returns:
        Active BookingPeriod or None if no active period found
    """
    check_date = registration_date or date.today()

    # Find periods where check_date falls within start_date/end_date range
    stmt = (
        select(BookingPeriod)
        .where(
            BookingPeriod.conference_id == conference_id,
            BookingPeriod.tenant_id == tenant_id,
            BookingPeriod.is_active == True,
            BookingPeriod.start_date <= check_date,
            BookingPeriod.end_date >= check_date,
        )
        .order_by(BookingPeriod.sort_order.asc())
        .limit(1)
    )
    result = await db.execute(stmt)
    period = result.scalar_one_or_none()

    # Fallback: if no active period for check_date, get first active period
    if not period:
        stmt = (
            select(BookingPeriod)
            .where(
                BookingPeriod.conference_id == conference_id,
                BookingPeriod.tenant_id == tenant_id,
                BookingPeriod.is_active == True,
            )
            .order_by(BookingPeriod.sort_order.asc())
            .limit(1)
        )
        result = await db.execute(stmt)
        period = result.scalar_one_or_none()

    return period
