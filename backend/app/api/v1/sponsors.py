"""Sponsor management endpoints (conference-scoped)."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.core.dependencies import CurrentUserDep, DbSessionDep, get_client_ip, require_module
from app.core.exceptions import ConflictError, NotFoundError
from app.core.search import unaccent_ilike
from app.models.attachment import Attachment
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.settings import SponsorPackage
from app.models.sponsor import Sponsor
from app.models.sponsor_contract import SponsorContract
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


async def _auto_generate_contract(
    db: DbSessionDep,
    sponsor: Sponsor,
    current_user: CurrentUserDep,
) -> None:
    """Auto-generate a contract from the package template if one exists."""
    from app.api.v1.sponsor_contracts import _convert_to_html, _generate_contract_filename

    # Check if template exists for the package
    template_result = await db.execute(
        select(Attachment)
        .where(
            Attachment.entity_type == "sponsor_package_contract",
            Attachment.entity_id == sponsor.sponsor_package_id,
            Attachment.tenant_id == current_user.tenant_id,
        )
        .order_by(Attachment.created_at.desc())
    )
    template = template_result.scalar_one_or_none()
    if not template:
        return  # No template — nothing to generate

    # Get package and conference
    pkg_result = await db.execute(select(SponsorPackage).where(SponsorPackage.id == sponsor.sponsor_package_id))
    package = pkg_result.scalar_one_or_none()
    if not package:
        return

    conf_result = await db.execute(select(Conference).where(Conference.id == sponsor.conference_id))
    conference = conf_result.scalar_one_or_none()
    if not conference:
        return

    filename = _generate_contract_filename(conference, package, sponsor.company_name)
    is_pdf = template.content_type == "application/pdf"
    html_content = _convert_to_html(template.file_data, template.content_type)

    contract = SponsorContract(
        tenant_id=current_user.tenant_id,
        sponsor_id=sponsor.id,
        conference_id=sponsor.conference_id,
        source_package_id=sponsor.sponsor_package_id,
        filename=filename,
        content_type=template.content_type,
        file_data=template.file_data,
        file_size=template.file_size,
        html_content=html_content,
        is_editable=not is_pdf,
        version=1,
        status="draft",
        created_by=current_user.user_id,
    )
    db.add(contract)
    await db.flush()


def build_sponsor_response(
    sponsor: Sponsor,
    package_name: str | None = None,
    has_invoices: bool = False,
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
        has_invoices=has_invoices,
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
        query = query.where(unaccent_ilike(Sponsor.company_name, search) | unaccent_ilike(Sponsor.city, search))

    query = svc.apply_filters(
        query,
        [
            (Sponsor.sponsor_package_id == sponsor_package_id, sponsor_package_id),
            (Sponsor.is_active == is_active, is_active),
        ],
    )

    query = query.order_by(Sponsor.company_name)

    result = await svc.list_resources(db, query, page, page_size)

    # Batch lookup: which sponsors have linked invoices
    sponsor_ids = [s.id for s in result.items]
    sponsors_with_invoices: set[UUID] = set()
    if sponsor_ids:
        inv_result = await db.execute(
            select(Invoice.recipient_source_id)
            .where(
                Invoice.tenant_id == current_user.tenant_id,
                Invoice.recipient_source_type == "sponsor",
                Invoice.recipient_source_id.in_(sponsor_ids),
            )
            .distinct()
        )
        sponsors_with_invoices = set(inv_result.scalars().all())

    items = [
        build_sponsor_response(
            s,
            s.sponsor_package.name if s.sponsor_package else None,
            has_invoices=s.id in sponsors_with_invoices,
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

    conference = await svc.resolve_conference(db, conference_id, current_user.tenant_id)

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
            [cp.model_dump() for cp in sponsor_data.contact_persons] if sponsor_data.contact_persons else []
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

    # Auto-generate contract if package has a template
    if sponsor.sponsor_package_id:
        await _auto_generate_contract(db, sponsor, current_user)

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

    # Check if sponsor has linked invoices
    inv_count = await db.execute(
        select(sa_func.count())
        .select_from(Invoice)
        .where(
            Invoice.tenant_id == current_user.tenant_id,
            Invoice.recipient_source_type == "sponsor",
            Invoice.recipient_source_id == sponsor_id,
        )
    )
    has_invoices = (inv_count.scalar() or 0) > 0

    return build_sponsor_response(
        sponsor,
        sponsor.sponsor_package.name if sponsor.sponsor_package else None,
        has_invoices=has_invoices,
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
        db,
        Sponsor,
        sponsor_id,
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
            cp.model_dump() if hasattr(cp, "model_dump") else cp for cp in update_data["contact_persons"]
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
        select(Sponsor).where(Sponsor.id == sponsor_id).options(joinedload(Sponsor.sponsor_package))
    )
    sponsor = refreshed_result.scalar_one()

    # Check if sponsor has linked invoices
    inv_count = await db.execute(
        select(sa_func.count())
        .select_from(Invoice)
        .where(
            Invoice.tenant_id == current_user.tenant_id,
            Invoice.recipient_source_type == "sponsor",
            Invoice.recipient_source_id == sponsor_id,
        )
    )
    has_invoices = (inv_count.scalar() or 0) > 0

    return build_sponsor_response(
        sponsor,
        sponsor.sponsor_package.name if sponsor.sponsor_package else None,
        has_invoices=has_invoices,
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
        db,
        Sponsor,
        sponsor_id,
        conference_id=conference_id,
        tenant_id=current_user.tenant_id,
        label="Sponsor",
    )

    # Block deletion if sponsor has linked invoices
    invoice_count_result = await db.execute(
        select(sa_func.count())
        .select_from(Invoice)
        .where(
            Invoice.tenant_id == current_user.tenant_id,
            Invoice.recipient_source_type == "sponsor",
            Invoice.recipient_source_id == sponsor_id,
        )
    )
    invoice_count = invoice_count_result.scalar() or 0
    if invoice_count > 0:
        raise ConflictError(
            f"Cannot delete sponsor '{sponsor.company_name}' because it has "
            f"{invoice_count} linked invoice(s). Deactivate the sponsor instead."
        )

    company_name = sponsor.company_name

    # Delete associated attachments
    await svc.delete_related_attachments(db, "sponsor", sponsor_id, current_user.tenant_id)

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
