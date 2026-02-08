"""Sponsor Packages CRUD endpoints."""

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
from app.models.settings import SponsorPackage
from app.schemas.settings import (
    SponsorPackageCreate,
    SponsorPackageListResponse,
    SponsorPackageResponse,
    SponsorPackageUpdate,
)

from ._shared import _resolve_conference, _check_conference_admin

router = APIRouter()


@router.get("/sponsor-packages", response_model=SponsorPackageListResponse)
async def list_sponsor_packages(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SponsorPackageListResponse:
    """List all sponsor packages for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    query = (
        select(SponsorPackage)
        .where(
            SponsorPackage.conference_id == conference.id,
            SponsorPackage.tenant_id == conference.tenant_id,
        )
        .order_by(SponsorPackage.price.desc(), SponsorPackage.name)
    )
    result = await db.execute(query)
    packages = result.scalars().all()

    items = [
        SponsorPackageResponse(
            id=p.id,
            tenant_id=p.tenant_id,
            conference_id=p.conference_id,
            name=p.name,
            description=p.description,
            price=p.price,
            currency=p.currency,
            is_active=p.is_active,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in packages
    ]

    return SponsorPackageListResponse(items=items, total=len(items))


@router.post("/sponsor-packages", response_model=SponsorPackageResponse)
async def create_sponsor_package(
    conference_id: UUID,
    pkg_data: SponsorPackageCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> SponsorPackageResponse:
    """Create a new sponsor package for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    # Check unique name within conference
    existing = await db.execute(
        select(SponsorPackage).where(
            SponsorPackage.conference_id == conference.id,
            SponsorPackage.tenant_id == conference.tenant_id,
            SponsorPackage.name == pkg_data.name,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A sponsor package named '{pkg_data.name}' already exists")

    package = SponsorPackage(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        name=pkg_data.name,
        description=pkg_data.description,
        price=pkg_data.price,
        currency=pkg_data.currency,
        is_active=pkg_data.is_active,
    )
    db.add(package)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="sponsor_package.create",
        resource_type="sponsor_package",
        resource_id=package.id,
        details={"name": package.name, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(package)

    return SponsorPackageResponse(
        id=package.id,
        tenant_id=package.tenant_id,
        conference_id=package.conference_id,
        name=package.name,
        description=package.description,
        price=package.price,
        currency=package.currency,
        is_active=package.is_active,
        created_at=package.created_at,
        updated_at=package.updated_at,
    )


@router.put("/sponsor-packages/{package_id}", response_model=SponsorPackageResponse)
async def update_sponsor_package(
    conference_id: UUID,
    package_id: UUID,
    pkg_data: SponsorPackageUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> SponsorPackageResponse:
    """Update an existing sponsor package."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(SponsorPackage).where(
            SponsorPackage.id == package_id,
            SponsorPackage.conference_id == conference.id,
        )
    )
    package = result.scalar_one_or_none()
    if not package:
        raise NotFoundError(f"Sponsor package with ID '{package_id}' not found")

    # If name is changing, check uniqueness
    if pkg_data.name is not None and pkg_data.name != package.name:
        existing = await db.execute(
            select(SponsorPackage).where(
                SponsorPackage.conference_id == conference.id,
                SponsorPackage.tenant_id == conference.tenant_id,
                SponsorPackage.name == pkg_data.name,
                SponsorPackage.id != package_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"A sponsor package named '{pkg_data.name}' already exists")

    update_data = pkg_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(package, field, value)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="sponsor_package.update",
        resource_type="sponsor_package",
        resource_id=package.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(package)

    return SponsorPackageResponse(
        id=package.id,
        tenant_id=package.tenant_id,
        conference_id=package.conference_id,
        name=package.name,
        description=package.description,
        price=package.price,
        currency=package.currency,
        is_active=package.is_active,
        created_at=package.created_at,
        updated_at=package.updated_at,
    )


@router.delete("/sponsor-packages/{package_id}")
async def delete_sponsor_package(
    conference_id: UUID,
    package_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a sponsor package."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(SponsorPackage).where(
            SponsorPackage.id == package_id,
            SponsorPackage.conference_id == conference.id,
        )
    )
    package = result.scalar_one_or_none()
    if not package:
        raise NotFoundError(f"Sponsor package with ID '{package_id}' not found")

    pkg_name = package.name

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="sponsor_package.delete",
        resource_type="sponsor_package",
        resource_id=package.id,
        details={"name": pkg_name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(package)
    await db.commit()

    return {"message": f"Sponsor package '{pkg_name}' deleted successfully"}
