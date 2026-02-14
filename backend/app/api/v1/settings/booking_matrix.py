"""Booking Matrix endpoint."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.models.settings import BookingOption, BookingPackage, BookingPackageOption, BookingPeriod
from app.schemas.settings import (
    BookingMatrixResponse,
    BookingOptionResponse,
    BookingPackageResponse,
    BookingPeriodResponse,
)

from ._shared import _resolve_conference

router = APIRouter()


async def _get_package_option_ids(db: DbSessionDep, package_id: UUID) -> list[UUID]:
    """Get all option IDs for a package."""
    result = await db.execute(
        select(BookingPackageOption.booking_option_id).where(
            BookingPackageOption.booking_package_id == package_id
        )
    )
    return [row[0] for row in result.all()]


@router.get("/booking-matrix", response_model=BookingMatrixResponse)
async def get_booking_matrix(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BookingMatrixResponse:
    """Get the combined booking matrix (periods + options + packages) for a conference."""
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

    options_query = (
        select(BookingOption)
        .where(
            BookingOption.conference_id == conference.id,
            BookingOption.tenant_id == conference.tenant_id,
        )
        .order_by(BookingOption.sort_order, BookingOption.name)
    )
    options_result = await db.execute(options_query)
    options = options_result.scalars().all()

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

    option_items = [
        BookingOptionResponse(
            id=o.id,
            tenant_id=o.tenant_id,
            conference_id=o.conference_id,
            name=o.name,
            description=o.description,
            sort_order=o.sort_order,
            is_active=o.is_active,
            created_at=o.created_at,
            updated_at=o.updated_at,
        )
        for o in options
    ]

    package_items = []
    for pkg in packages:
        option_ids = await _get_package_option_ids(db, pkg.id)
        package_items.append(
            BookingPackageResponse(
                id=pkg.id,
                tenant_id=pkg.tenant_id,
                conference_id=pkg.conference_id,
                name=pkg.name,
                description=pkg.description,
                sort_order=pkg.sort_order,
                is_active=pkg.is_active,
                option_ids=option_ids,
                created_at=pkg.created_at,
                updated_at=pkg.updated_at,
            )
        )

    return BookingMatrixResponse(periods=period_items, options=option_items, packages=package_items)
