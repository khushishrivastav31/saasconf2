"""Sponsor management endpoints (conference-scoped)."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip, require_module
from app.core.exceptions import NotFoundError
from app.core.search import unaccent_ilike
from app.models.settings import SponsorPackage
from app.models.sponsor import Sponsor
from app.schemas.sponsor import (
    SponsorCreate,
    SponsorListResponse,
    SponsorResponse,
    SponsorUpdate,
)
from app.services.conference import ConferenceService

router = APIRouter()

MODULE_CODE = "sponsors"

svc = ConferenceService


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
    await svc.resolve_conference(db, conference_id, current_user.tenant_id)

    query = (
        select(Sponsor)
        .where(
            Sponsor.conference_id == conference_id,
            Sponsor.tenant_id == current_user.tenant_id,
        )
        .options(joinedload(Sponsor.sponsor_package))
    )

    if search:
        query = query.where(
            unaccent_ilike(Sponsor.company_name, search)
            | unaccent_ilike(Sponsor.city, search)
        )

    query = svc.apply_filters(query, [
        (Sponsor.sponsor_package_id == sponsor_package_id, sponsor_package_id),
        (Sponsor.is_active == is_active, is_active),
    ])

    query = query.order_by(Sponsor.company_name)

    result = await svc.list_resources(db, query, page, page_size)

    items = [
        build_sponsor_response(
            s,
            s.sponsor_package.name if s.sponsor_package else None,
        )
        for s in result.items
    ]

    return SponsorListResponse(
        items=items,
        total=result.total,
        page=page,
        page_size=page_size,
        pages=svc.calculate_pages(result.total, page_size),
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
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> SponsorResponse:
    """Create a new sponsor for a conference."""
    await svc.require_admin(db, current_user, conference_id)

    conference = await svc.resolve_conference(
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

    audit_log = svc.create_audit_log(
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

    await svc.create_resource(db, sponsor, audit_log=audit_log)

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
        select(Sponsor)
        .where(
            Sponsor.id == sponsor_id,
            Sponsor.conference_id == conference_id,
            Sponsor.tenant_id == current_user.tenant_id,
        )
        .options(joinedload(Sponsor.sponsor_package))
    )
    sponsor = result.scalar_one_or_none()
    if not sponsor:
        raise NotFoundError(f"Sponsor with ID '{sponsor_id}' not found")

    return build_sponsor_response(
        sponsor,
        sponsor.sponsor_package.name if sponsor.sponsor_package else None,
    )


@router.put(
    "/{sponsor_id}",
    response_model=SponsorResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_sponsor(
    conference_id: UUID,
    sponsor_id: UUID,
    sponsor_data: SponsorUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> SponsorResponse:
    """Update a sponsor."""
    await svc.require_admin(db, current_user, conference_id)

    sponsor = await svc.get_resource(
        db, Sponsor, sponsor_id,
        conference_id=conference_id,
        tenant_id=current_user.tenant_id,
        label="Sponsor",
    )

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

    audit_log = svc.create_audit_log(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="sponsor.update",
        resource_type="sponsor",
        resource_id=sponsor_id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )

    await svc.update_resource(db, sponsor, update_data, audit_log=audit_log)

    # Re-fetch with eager-loaded package
    refreshed_result = await db.execute(
        select(Sponsor)
        .where(Sponsor.id == sponsor_id)
        .options(joinedload(Sponsor.sponsor_package))
    )
    sponsor = refreshed_result.scalar_one()

    return build_sponsor_response(
        sponsor,
        sponsor.sponsor_package.name if sponsor.sponsor_package else None,
    )


@router.delete(
    "/{sponsor_id}",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_sponsor(
    conference_id: UUID,
    sponsor_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a sponsor and its attachments."""
    await svc.require_admin(db, current_user, conference_id)

    sponsor = await svc.get_resource(
        db, Sponsor, sponsor_id,
        conference_id=conference_id,
        tenant_id=current_user.tenant_id,
        label="Sponsor",
    )

    company_name = sponsor.company_name

    # Delete associated attachments
    await svc.delete_related_attachments(
        db, "sponsor", sponsor_id, current_user.tenant_id
    )

    audit_log = svc.create_audit_log(
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

    await svc.delete_resource(db, sponsor, audit_log=audit_log)

    return {"message": f"Sponsor '{company_name}' deleted successfully"}
