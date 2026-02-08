"""Booking Packages CRUD endpoints."""

from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.settings import BookingPackage
from app.schemas.settings import (
    BookingPackageCreate,
    BookingPackageListResponse,
    BookingPackageResponse,
    BookingPackageUpdate,
)

from ._shared import _resolve_conference, _check_conference_admin

router = APIRouter()


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

    items = [
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

    return BookingPackageListResponse(items=items, total=len(items))


@router.post("/booking-packages", response_model=BookingPackageResponse)
async def create_booking_package(
    conference_id: UUID,
    pkg_data: BookingPackageCreate,
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
            BookingPackage.name == pkg_data.name,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A booking package named '{pkg_data.name}' already exists")

    package = BookingPackage(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name=pkg_data.name,
        description=pkg_data.description,
        sort_order=pkg_data.sort_order,
        is_active=pkg_data.is_active,
    )
    db.add(package)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="booking_package.create",
        resource_type="booking_package",
        resource_id=package.id,
        details={"name": package.name, "conference_id": str(conference.id)},
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
        created_at=package.created_at,
        updated_at=package.updated_at,
    )


@router.put("/booking-packages/{package_id}", response_model=BookingPackageResponse)
async def update_booking_package(
    conference_id: UUID,
    package_id: UUID,
    pkg_data: BookingPackageUpdate,
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
    if pkg_data.name is not None and pkg_data.name != package.name:
        existing = await db.execute(
            select(BookingPackage).where(
                BookingPackage.conference_id == conference.id,
                BookingPackage.tenant_id == conference.tenant_id,
                BookingPackage.name == pkg_data.name,
                BookingPackage.id != package_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"A booking package named '{pkg_data.name}' already exists")

    update_data = pkg_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(package, field, value)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="booking_package.update",
        resource_type="booking_package",
        resource_id=package.id,
        details={"updated_fields": list(update_data.keys())},
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

    pkg_name = package.name

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="booking_package.delete",
        resource_type="booking_package",
        resource_id=package.id,
        details={"name": pkg_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(package)

    # Clean up dangling package_id key from all booking_periods prices JSONB
    await db.execute(
        sa.text(
            "UPDATE booking_periods SET prices = prices - :package_key "
            "WHERE conference_id = :conf_id AND tenant_id = :tenant_id AND prices ? :package_key"
        ),
        {"package_key": str(package_id), "conf_id": conference.id, "tenant_id": conference.tenant_id},
    )

    await db.commit()

    return {"message": f"Booking package '{pkg_name}' deleted successfully"}
