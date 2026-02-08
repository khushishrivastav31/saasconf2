"""Booking Matrix endpoint."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.models.settings import BookingPackage, BookingPeriod
from app.schemas.settings import (
    BookingMatrixResponse,
    BookingPackageResponse,
    BookingPeriodResponse,
)

from ._shared import _resolve_conference, _check_conference_admin

router = APIRouter()


@router.get("/booking-matrix", response_model=BookingMatrixResponse)
async def get_booking_matrix(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BookingMatrixResponse:
    """Get the combined booking matrix (periods + packages) for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    periods_query = (
        select(BookingPeriod)
        .where(
            BookingPeriod.conference_id == conference.id,
            BookingPeriod.tenant_id == conference.tenant_id,
        )
        .order_by(BookingPeriod.sort_order, BookingPeriod.name)
    )
    periods_result = await db.execute(periods_query)
    periods = periods_result.scalars().all()

    packages_query = (
        select(BookingPackage)
        .where(
            BookingPackage.conference_id == conference.id,
            BookingPackage.tenant_id == conference.tenant_id,
        )
        .order_by(BookingPackage.sort_order, BookingPackage.name)
    )
    packages_result = await db.execute(packages_query)
    packages = packages_result.scalars().all()

    period_items = [
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

    package_items = [
        BookingPackageResponse(
            id=p.id,
            tenant_id=p.tenant_id,
            conference_id=p.conference_id,
            name=p.name,
            description=p.description,
            sort_order=p.sort_order,
            is_active=p.is_active,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in packages
    ]

    return BookingMatrixResponse(periods=period_items, packages=package_items)
