"""Booking Packages CRUD endpoints."""

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
from app.models.settings import BookingOption, BookingPackage, BookingPackageOption
from app.schemas.settings import (
    BookingPackageCreate,
    BookingPackageListResponse,
    BookingPackageResponse,
    BookingPackageUpdate,
)

from ._shared import _resolve_conference, _check_conference_admin

router = APIRouter()


async def _get_package_option_ids(db: DbSessionDep, package_id: UUID) -> list[UUID]:
    """Get all option IDs for a package."""
    result = await db.execute(
        select(BookingPackageOption.booking_option_id).where(
            BookingPackageOption.booking_package_id == package_id
        )
    )
    return [row[0] for row in result.all()]


@router.get("/booking-packages", response_model=BookingPackageListResponse)
async def list_booking_packages(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> BookingPackageListResponse:
    """List all booking packages for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    query = (
        select(BookingPackage)
        .where(
            BookingPackage.conference_id == conference.id,
            BookingPackage.tenant_id == conference.tenant_id,
        )
        .order_by(BookingPackage.sort_order, BookingPackage.name)
    )
    result = await db.execute(query)
    packages = result.scalars().all()

    items = []
    for pkg in packages:
        option_ids = await _get_package_option_ids(db, pkg.id)
        items.append(
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

    return BookingPackageListResponse(items=items, total=len(items))


@router.post("/booking-packages", response_model=BookingPackageResponse)
async def create_booking_package(
    conference_id: UUID,
    package_data: BookingPackageCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> BookingPackageResponse:
    """Create a new booking package for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    # Check unique name within conference
    existing = await db.execute(
        select(BookingPackage).where(
            BookingPackage.conference_id == conference.id,
            BookingPackage.tenant_id == conference.tenant_id,
            BookingPackage.name == package_data.name,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A booking package named '{package_data.name}' already exists")

    # Verify all option IDs exist and belong to this conference
    for option_id in package_data.option_ids:
        result = await db.execute(
            select(BookingOption).where(
                BookingOption.id == option_id,
                BookingOption.conference_id == conference.id,
            )
        )
        if not result.scalar_one_or_none():
            raise ValidationError(f"Booking option with ID '{option_id}' not found in this conference")

    package = BookingPackage(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name=package_data.name,
        description=package_data.description,
        sort_order=package_data.sort_order,
        is_active=package_data.is_active,
    )
    db.add(package)
    await db.flush()

    # Create package-option associations
    for option_id in package_data.option_ids:
        db.add(BookingPackageOption(
            tenant_id=conference.tenant_id,
            booking_package_id=package.id,
            booking_option_id=option_id,
        ))

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="booking_package.create",
        resource_type="booking_package",
        resource_id=package.id,
        details={"name": package.name, "conference_id": str(conference.id), "option_count": len(package_data.option_ids)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(package)

    return BookingPackageResponse(
        id=package.id,
        tenant_id=package.tenant_id,
        conference_id=package.conference_id,
        name=package.name,
        description=package.description,
        sort_order=package.sort_order,
        is_active=package.is_active,
        option_ids=package_data.option_ids,
        created_at=package.created_at,
        updated_at=package.updated_at,
    )


@router.put("/booking-packages/{package_id}", response_model=BookingPackageResponse)
async def update_booking_package(
    conference_id: UUID,
    package_id: UUID,
    package_data: BookingPackageUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> BookingPackageResponse:
    """Update an existing booking package."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(BookingPackage).where(
            BookingPackage.id == package_id,
            BookingPackage.conference_id == conference.id,
        )
    )
    package = result.scalar_one_or_none()
    if not package:
        raise NotFoundError(f"Booking package with ID '{package_id}' not found")

    # If name is changing, check uniqueness
    if package_data.name is not None and package_data.name != package.name:
        existing = await db.execute(
            select(BookingPackage).where(
                BookingPackage.conference_id == conference.id,
                BookingPackage.tenant_id == conference.tenant_id,
                BookingPackage.name == package_data.name,
                BookingPackage.id != package_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"A booking package named '{package_data.name}' already exists")

    # Update basic fields
    update_data = package_data.model_dump(exclude_unset=True, exclude={"option_ids"})
    for field, value in update_data.items():
        setattr(package, field, value)

    # Update option associations if provided
    if package_data.option_ids is not None:
        # Verify all option IDs exist
        for option_id in package_data.option_ids:
            result = await db.execute(
                select(BookingOption).where(
                    BookingOption.id == option_id,
                    BookingOption.conference_id == conference.id,
                )
            )
            if not result.scalar_one_or_none():
                raise ValidationError(f"Booking option with ID '{option_id}' not found in this conference")

        # Delete existing associations
        await db.execute(
            BookingPackageOption.__table__.delete().where(
                BookingPackageOption.booking_package_id == package_id
            )
        )

        # Create new associations
        for option_id in package_data.option_ids:
            db.add(BookingPackageOption(
                tenant_id=conference.tenant_id,
                booking_package_id=package.id,
                booking_option_id=option_id,
            ))

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="booking_package.update",
        resource_type="booking_package",
        resource_id=package.id,
        details={"updated_fields": list(package_data.model_dump(exclude_unset=True).keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(package)

    # Get final option IDs
    option_ids = await _get_package_option_ids(db, package.id)

    return BookingPackageResponse(
        id=package.id,
        tenant_id=package.tenant_id,
        conference_id=package.conference_id,
        name=package.name,
        description=package.description,
        sort_order=package.sort_order,
        is_active=package.is_active,
        option_ids=option_ids,
        created_at=package.created_at,
        updated_at=package.updated_at,
    )


@router.delete("/booking-packages/{package_id}")
async def delete_booking_package(
    conference_id: UUID,
    package_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a booking package."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(BookingPackage).where(
            BookingPackage.id == package_id,
            BookingPackage.conference_id == conference.id,
        )
    )
    package = result.scalar_one_or_none()
    if not package:
        raise NotFoundError(f"Booking package with ID '{package_id}' not found")

    package_name = package.name

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="booking_package.delete",
        resource_type="booking_package",
        resource_id=package.id,
        details={"name": package_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    # Delete package (cascade will delete package_options)
    await db.delete(package)
    await db.commit()

    return {"message": f"Booking package '{package_name}' deleted successfully"}
