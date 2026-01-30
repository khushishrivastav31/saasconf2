"""Sponsor management endpoints (conference-scoped)."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import delete as sa_delete
from sqlalchemy import select

from app.core.dependencies import CurrentUserDep, DbSessionDep, TenantAdminDep, get_client_ip, require_module
from app.core.exceptions import NotFoundError
from app.core.pagination import paginate
from app.models.attachment import Attachment
from app.models.audit import AuditLog
from app.models.conference import Conference
from app.models.settings import SponsorPackage
from app.models.sponsor import Sponsor
from app.schemas.sponsor import (
    SponsorCreate,
    SponsorListResponse,
    SponsorResponse,
    SponsorUpdate,
)

router = APIRouter()

MODULE_CODE = "sponsors"


async def _get_conference_for_tenant(
    db, conference_id: UUID, tenant_id: UUID
) -> Conference:
    """Fetch conference and raise 404 if not found or not owned by tenant."""
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == tenant_id,
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError(f"Conference with ID '{conference_id}' not found")
    return conference


def build_sponsor_response(
    sponsor: Sponsor, package_name: str | None = None
) -> SponsorResponse:
    """Build a SponsorResponse from a Sponsor model."""
    return SponsorResponse(
        id=sponsor.id,
        tenant_id=sponsor.tenant_id,
        conference_id=sponsor.conference_id,
        sponsor_package_id=sponsor.sponsor_package_id,
        sponsor_package_name=package_name,
        company_name=sponsor.company_name,
        phone=sponsor.phone,
        website=sponsor.website,
        address_line1=sponsor.address_line1,
        address_line2=sponsor.address_line2,
        city=sponsor.city,
        state=sponsor.state,
        postal_code=sponsor.postal_code,
        country=sponsor.country,
        vat_number=sponsor.vat_number,
        price=sponsor.price,
        currency=sponsor.currency,
        comments=sponsor.comments,
        contact_persons=sponsor.contact_persons or [],
        is_active=sponsor.is_active,
        created_at=sponsor.created_at,
        updated_at=sponsor.updated_at,
    )


async def _get_package_name_map(
    db, conference_id: UUID
) -> dict[UUID, str]:
    """Batch-fetch sponsor package names for a conference."""
    result = await db.execute(
        select(SponsorPackage.id, SponsorPackage.name).where(
            SponsorPackage.conference_id == conference_id
        )
    )
    return {row.id: row.name for row in result.all()}


@router.get(
    "",
    response_model=SponsorListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_sponsors(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: str | None = None,
    sponsor_package_id: UUID | None = None,
    is_active: bool | None = None,
) -> SponsorListResponse:
    """List sponsors for a conference with pagination and filtering."""
    await _get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    query = select(Sponsor).where(
        Sponsor.conference_id == conference_id,
        Sponsor.tenant_id == current_user.tenant_id,
    )

    if search:
        query = query.where(
            Sponsor.company_name.ilike(f"%{search}%")
            | Sponsor.city.ilike(f"%{search}%")
        )

    if sponsor_package_id is not None:
        query = query.where(Sponsor.sponsor_package_id == sponsor_package_id)

    if is_active is not None:
        query = query.where(Sponsor.is_active == is_active)

    query = query.order_by(Sponsor.company_name)

    result = await paginate(db, query, page, page_size)

    # Batch-fetch package names
    pkg_map = await _get_package_name_map(db, conference_id)

    items = [
        build_sponsor_response(s, pkg_map.get(s.sponsor_package_id))
        for s in result.items
    ]

    return SponsorListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=(result.total + page_size - 1) // page_size,
    )


@router.post(
    "",
    response_model=SponsorResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_sponsor(
    conference_id: UUID,
    sponsor_data: SponsorCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> SponsorResponse:
    """Create a new sponsor for a conference."""
    conference = await _get_conference_for_tenant(
        db, conference_id, current_user.tenant_id
    )

    # Validate package if provided
    package_name: str | None = None
    if sponsor_data.sponsor_package_id:
        pkg_result = await db.execute(
            select(SponsorPackage).where(
                SponsorPackage.id == sponsor_data.sponsor_package_id,
                SponsorPackage.conference_id == conference.id,
            )
        )
        pkg = pkg_result.scalar_one_or_none()
        if not pkg:
            raise NotFoundError("Sponsor package not found for this conference")
        package_name = pkg.name
        # Auto-fill price/currency from package if not provided
        if sponsor_data.price is None and pkg.price is not None:
            sponsor_data.price = pkg.price
        if sponsor_data.currency is None and pkg.currency is not None:
            sponsor_data.currency = pkg.currency

    sponsor = Sponsor(
        tenant_id=current_user.tenant_id,
        conference_id=conference.id,
        sponsor_package_id=sponsor_data.sponsor_package_id,
        company_name=sponsor_data.company_name,
        phone=sponsor_data.phone,
        website=sponsor_data.website,
        address_line1=sponsor_data.address_line1,
        address_line2=sponsor_data.address_line2,
        city=sponsor_data.city,
        state=sponsor_data.state,
        postal_code=sponsor_data.postal_code,
        country=sponsor_data.country,
        vat_number=sponsor_data.vat_number,
        price=sponsor_data.price,
        currency=sponsor_data.currency,
        comments=sponsor_data.comments,
        contact_persons=(
            [cp.model_dump() for cp in sponsor_data.contact_persons]
            if sponsor_data.contact_persons
            else []
        ),
        is_active=sponsor_data.is_active,
    )
    db.add(sponsor)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="sponsor.create",
        resource_type="sponsor",
        resource_id=sponsor.id,
        details={
            "company_name": sponsor.company_name,
            "conference_id": str(conference.id),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(sponsor)

    return build_sponsor_response(sponsor, package_name)


@router.get(
    "/{sponsor_id}",
    response_model=SponsorResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_sponsor(
    conference_id: UUID,
    sponsor_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> SponsorResponse:
    """Get a single sponsor."""
    result = await db.execute(
        select(Sponsor).where(
            Sponsor.id == sponsor_id,
            Sponsor.conference_id == conference_id,
            Sponsor.tenant_id == current_user.tenant_id,
        )
    )
    sponsor = result.scalar_one_or_none()
    if not sponsor:
        raise NotFoundError(f"Sponsor with ID '{sponsor_id}' not found")

    # Fetch package name
    package_name: str | None = None
    if sponsor.sponsor_package_id:
        pkg_result = await db.execute(
            select(SponsorPackage.name).where(
                SponsorPackage.id == sponsor.sponsor_package_id
            )
        )
        row = pkg_result.scalar_one_or_none()
        if row:
            package_name = row

    return build_sponsor_response(sponsor, package_name)


@router.put(
    "/{sponsor_id}",
    response_model=SponsorResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_sponsor(
    conference_id: UUID,
    sponsor_id: UUID,
    sponsor_data: SponsorUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> SponsorResponse:
    """Update a sponsor."""
    result = await db.execute(
        select(Sponsor).where(
            Sponsor.id == sponsor_id,
            Sponsor.conference_id == conference_id,
            Sponsor.tenant_id == current_user.tenant_id,
        )
    )
    sponsor = result.scalar_one_or_none()
    if not sponsor:
        raise NotFoundError(f"Sponsor with ID '{sponsor_id}' not found")

    update_data = sponsor_data.model_dump(exclude_unset=True)

    # Validate new package if provided
    if "sponsor_package_id" in update_data and update_data["sponsor_package_id"] is not None:
        pkg_result = await db.execute(
            select(SponsorPackage).where(
                SponsorPackage.id == update_data["sponsor_package_id"],
                SponsorPackage.conference_id == conference_id,
            )
        )
        if not pkg_result.scalar_one_or_none():
            raise NotFoundError("Sponsor package not found for this conference")

    # Serialize contact persons if present
    if "contact_persons" in update_data and update_data["contact_persons"] is not None:
        update_data["contact_persons"] = [
            cp.model_dump() if hasattr(cp, "model_dump") else cp
            for cp in update_data["contact_persons"]
        ]

    for field, value in update_data.items():
        setattr(sponsor, field, value)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="sponsor.update",
        resource_type="sponsor",
        resource_id=sponsor_id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(sponsor)

    # Fetch package name
    package_name: str | None = None
    if sponsor.sponsor_package_id:
        pkg_result = await db.execute(
            select(SponsorPackage.name).where(
                SponsorPackage.id == sponsor.sponsor_package_id
            )
        )
        row = pkg_result.scalar_one_or_none()
        if row:
            package_name = row

    return build_sponsor_response(sponsor, package_name)


@router.delete(
    "/{sponsor_id}",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_sponsor(
    conference_id: UUID,
    sponsor_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a sponsor and its attachments."""
    result = await db.execute(
        select(Sponsor).where(
            Sponsor.id == sponsor_id,
            Sponsor.conference_id == conference_id,
            Sponsor.tenant_id == current_user.tenant_id,
        )
    )
    sponsor = result.scalar_one_or_none()
    if not sponsor:
        raise NotFoundError(f"Sponsor with ID '{sponsor_id}' not found")

    company_name = sponsor.company_name

    # Delete associated attachments
    await db.execute(
        sa_delete(Attachment).where(
            Attachment.entity_type == "sponsor",
            Attachment.entity_id == sponsor_id,
            Attachment.tenant_id == current_user.tenant_id,
        )
    )

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="sponsor.delete",
        resource_type="sponsor",
        resource_id=sponsor_id,
        details={
            "company_name": company_name,
            "conference_id": str(conference_id),
        },
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(sponsor)
    await db.commit()

    return {"message": f"Sponsor '{company_name}' deleted successfully"}
