"""Fiscal representative and conference VAT rate endpoints."""

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from sqlalchemy import and_, select
from sqlalchemy.orm.attributes import flag_modified

from app.core.conference_helpers import get_conference_for_tenant
from app.core.vat_validation import normalize_country
from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    check_conference_admin_access,
    get_client_ip,
    require_module,
)
from app.core.exceptions import AuthorizationError, NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.conference_vat_rate import ConferenceVatRate
from app.models.fiscal_representative import FiscalRepresentative
from app.models.tenant import Tenant
from app.schemas.conference_vat_rate import (
    ConferenceVatRateCreate,
    ConferenceVatRateListResponse,
    ConferenceVatRateResponse,
    ConferenceVatRateUpdate,
    TaxInfoResponse,
)
from app.schemas.fiscal_representative import (
    FiscalRepresentativeResponse,
    FiscalRepresentativeUpsert,
)

router = APIRouter()

MODULE_CODE = "conferences"


async def _check_admin(db, current_user, conference_id: UUID) -> None:
    """Check that the user has admin access to the conference."""
    if not current_user.is_super_admin and not current_user.is_tenant_admin:
        has_access = await check_conference_admin_access(db, current_user.user_id, conference_id)
        if not has_access:
            raise AuthorizationError("Admin access to this conference required")


# --- Fiscal Representative endpoints ---


@router.get(
    "/{conference_id}/fiscal-representative",
    response_model=FiscalRepresentativeResponse | None,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_fiscal_representative(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> FiscalRepresentativeResponse | None:
    """Get the fiscal representative for a conference."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(FiscalRepresentative)
        .where(FiscalRepresentative.conference_id == conference_id)
        .where(FiscalRepresentative.tenant_id == current_user.tenant_id)
    )
    fiscal_rep = result.scalar_one_or_none()
    if not fiscal_rep:
        return None

    return FiscalRepresentativeResponse.model_validate(fiscal_rep)


@router.put(
    "/{conference_id}/fiscal-representative",
    response_model=FiscalRepresentativeResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def upsert_fiscal_representative(
    conference_id: UUID,
    data: FiscalRepresentativeUpsert,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> FiscalRepresentativeResponse:
    """Create or update the fiscal representative for a conference (upsert)."""
    await _check_admin(db, current_user, conference_id)
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(FiscalRepresentative)
        .where(FiscalRepresentative.conference_id == conference_id)
        .where(FiscalRepresentative.tenant_id == current_user.tenant_id)
    )
    fiscal_rep = result.scalar_one_or_none()

    contact_persons_data = [cp.model_dump() for cp in data.contact_persons] if data.contact_persons else []

    if fiscal_rep:
        # Update existing
        fiscal_rep.company_name = data.company_name
        fiscal_rep.address_line1 = data.address_line1
        fiscal_rep.address_line2 = data.address_line2
        fiscal_rep.city = data.city
        fiscal_rep.state = data.state
        fiscal_rep.postal_code = data.postal_code
        fiscal_rep.country = data.country
        fiscal_rep.phone = data.phone
        fiscal_rep.email = data.email
        fiscal_rep.website = data.website
        fiscal_rep.vat_number = data.vat_number
        fiscal_rep.conference_vat_number = data.conference_vat_number
        fiscal_rep.contact_persons = contact_persons_data
        fiscal_rep.is_active = data.is_active
        flag_modified(fiscal_rep, "contact_persons")
        action = "fiscal_representative.update"
    else:
        # Create new
        fiscal_rep = FiscalRepresentative(
            tenant_id=current_user.tenant_id,
            conference_id=conference_id,
            company_name=data.company_name,
            address_line1=data.address_line1,
            address_line2=data.address_line2,
            city=data.city,
            state=data.state,
            postal_code=data.postal_code,
            country=data.country,
            phone=data.phone,
            email=data.email,
            website=data.website,
            vat_number=data.vat_number,
            conference_vat_number=data.conference_vat_number,
            contact_persons=contact_persons_data,
            is_active=data.is_active,
        )
        db.add(fiscal_rep)
        action = "fiscal_representative.create"

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action=action,
            resource_type="fiscal_representative",
            resource_id=fiscal_rep.id,
            details={"company_name": data.company_name, "conference_id": str(conference_id)},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()
    await db.refresh(fiscal_rep)

    return FiscalRepresentativeResponse.model_validate(fiscal_rep)


@router.delete(
    "/{conference_id}/fiscal-representative",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_fiscal_representative(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete the fiscal representative for a conference."""
    await _check_admin(db, current_user, conference_id)
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(FiscalRepresentative)
        .where(FiscalRepresentative.conference_id == conference_id)
        .where(FiscalRepresentative.tenant_id == current_user.tenant_id)
    )
    fiscal_rep = result.scalar_one_or_none()
    if not fiscal_rep:
        raise NotFoundError("Fiscal representative not found for this conference")

    company_name = fiscal_rep.company_name
    await db.delete(fiscal_rep)

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="fiscal_representative.delete",
            resource_type="fiscal_representative",
            resource_id=fiscal_rep.id,
            details={"company_name": company_name, "conference_id": str(conference_id)},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()
    return {"message": f"Fiscal representative '{company_name}' deleted"}


# --- VAT Rates endpoints ---


@router.get(
    "/{conference_id}/vat-rates",
    response_model=ConferenceVatRateListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_vat_rates(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ConferenceVatRateListResponse:
    """List all VAT rate periods for a conference."""
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ConferenceVatRate)
        .where(ConferenceVatRate.conference_id == conference_id)
        .where(ConferenceVatRate.tenant_id == current_user.tenant_id)
        .order_by(ConferenceVatRate.start_date)
    )
    rates = result.scalars().all()

    items = [ConferenceVatRateResponse.model_validate(r) for r in rates]
    return ConferenceVatRateListResponse(items=items, total=len(items))


async def _check_vat_rate_overlap(
    db, tenant_id: UUID, conference_id: UUID, start_date: date, end_date: date, exclude_id: UUID | None = None
) -> None:
    """Check for overlapping VAT rate periods."""
    query = (
        select(ConferenceVatRate)
        .where(ConferenceVatRate.conference_id == conference_id)
        .where(ConferenceVatRate.tenant_id == tenant_id)
        .where(
            and_(
                ConferenceVatRate.start_date <= end_date,
                ConferenceVatRate.end_date >= start_date,
            )
        )
    )
    if exclude_id:
        query = query.where(ConferenceVatRate.id != exclude_id)

    result = await db.execute(query)
    overlap = result.scalar_one_or_none()
    if overlap:
        raise ValidationError(
            f"VAT rate period overlaps with existing period "
            f"({overlap.start_date} - {overlap.end_date}, {overlap.rate}%)"
        )


@router.post(
    "/{conference_id}/vat-rates",
    response_model=ConferenceVatRateResponse,
    status_code=201,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def create_vat_rate(
    conference_id: UUID,
    data: ConferenceVatRateCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ConferenceVatRateResponse:
    """Add a new VAT rate period for a conference."""
    await _check_admin(db, current_user, conference_id)
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Check for overlapping periods
    await _check_vat_rate_overlap(db, current_user.tenant_id, conference_id, data.start_date, data.end_date)

    rate = ConferenceVatRate(
        tenant_id=current_user.tenant_id,
        conference_id=conference_id,
        rate=data.rate,
        start_date=data.start_date,
        end_date=data.end_date,
        description=data.description,
    )
    db.add(rate)

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="conference_vat_rate.create",
            resource_type="conference_vat_rate",
            resource_id=rate.id,
            details={
                "rate": str(data.rate),
                "start_date": str(data.start_date),
                "end_date": str(data.end_date),
                "conference_id": str(conference_id),
            },
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()
    await db.refresh(rate)

    return ConferenceVatRateResponse.model_validate(rate)


@router.put(
    "/{conference_id}/vat-rates/{rate_id}",
    response_model=ConferenceVatRateResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def update_vat_rate(
    conference_id: UUID,
    rate_id: UUID,
    data: ConferenceVatRateUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> ConferenceVatRateResponse:
    """Update a VAT rate period."""
    await _check_admin(db, current_user, conference_id)
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ConferenceVatRate)
        .where(ConferenceVatRate.id == rate_id)
        .where(ConferenceVatRate.conference_id == conference_id)
        .where(ConferenceVatRate.tenant_id == current_user.tenant_id)
    )
    rate = result.scalar_one_or_none()
    if not rate:
        raise NotFoundError("VAT rate not found")

    update_data = data.model_dump(exclude_unset=True)

    # Determine effective dates for overlap check
    new_start = update_data.get("start_date", rate.start_date)
    new_end = update_data.get("end_date", rate.end_date)

    # Validate end_date >= start_date
    if new_end < new_start:
        raise ValidationError("End date cannot be before start date")

    # Check for overlapping periods (exclude self)
    if "start_date" in update_data or "end_date" in update_data:
        await _check_vat_rate_overlap(db, current_user.tenant_id, conference_id, new_start, new_end, exclude_id=rate_id)

    for field, value in update_data.items():
        setattr(rate, field, value)

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="conference_vat_rate.update",
            resource_type="conference_vat_rate",
            resource_id=rate.id,
            details={"updated_fields": list(update_data.keys()), "conference_id": str(conference_id)},
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()
    await db.refresh(rate)

    return ConferenceVatRateResponse.model_validate(rate)


@router.delete(
    "/{conference_id}/vat-rates/{rate_id}",
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def delete_vat_rate(
    conference_id: UUID,
    rate_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a VAT rate period."""
    await _check_admin(db, current_user, conference_id)
    await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    result = await db.execute(
        select(ConferenceVatRate)
        .where(ConferenceVatRate.id == rate_id)
        .where(ConferenceVatRate.conference_id == conference_id)
        .where(ConferenceVatRate.tenant_id == current_user.tenant_id)
    )
    rate = result.scalar_one_or_none()
    if not rate:
        raise NotFoundError("VAT rate not found")

    await db.delete(rate)

    db.add(
        AuditLog(
            tenant_id=current_user.tenant_id,
            user_id=current_user.user_id,
            action="conference_vat_rate.delete",
            resource_type="conference_vat_rate",
            resource_id=rate_id,
            details={
                "rate": str(rate.rate),
                "start_date": str(rate.start_date),
                "end_date": str(rate.end_date),
                "conference_id": str(conference_id),
            },
            ip_address=get_client_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    )

    await db.commit()
    return {"message": "VAT rate deleted"}


# --- Tax Info endpoint ---


@router.get(
    "/{conference_id}/tax-info",
    response_model=TaxInfoResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def get_tax_info(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> TaxInfoResponse:
    """Get combined tax representation info for a conference."""
    conference = await get_conference_for_tenant(db, conference_id, current_user.tenant_id)

    # Get tenant country and VAT number
    tenant_result = await db.execute(
        select(Tenant.country, Tenant.vat_number).where(Tenant.id == current_user.tenant_id)
    )
    tenant_row = tenant_result.one_or_none()
    tenant_country = tenant_row[0] if tenant_row else None
    tenant_vat = tenant_row[1] if tenant_row else None

    # Get fiscal representative
    fr_result = await db.execute(
        select(FiscalRepresentative)
        .where(FiscalRepresentative.conference_id == conference_id)
        .where(FiscalRepresentative.tenant_id == current_user.tenant_id)
    )
    fiscal_rep = fr_result.scalar_one_or_none()

    # Get all VAT rates
    rates_result = await db.execute(
        select(ConferenceVatRate)
        .where(ConferenceVatRate.conference_id == conference_id)
        .where(ConferenceVatRate.tenant_id == current_user.tenant_id)
        .order_by(ConferenceVatRate.start_date)
    )
    vat_rates = rates_result.scalars().all()

    # Determine representation type — normalize both to ISO codes for comparison
    # (tenant may store "DE", conference may store "Germany")
    conference_country = conference.country
    tenant_code = normalize_country(tenant_country) if tenant_country else None
    conference_code = normalize_country(conference_country) if conference_country else None
    same_country = bool(tenant_code and conference_code and tenant_code == conference_code)

    if same_country:
        representation_type = "self"
        effective_vat_number = tenant_vat
    elif fiscal_rep and fiscal_rep.is_active:
        representation_type = "fiscal_representative"
        effective_vat_number = fiscal_rep.conference_vat_number
    else:
        representation_type = "fiscal_representative"
        effective_vat_number = None

    # Find current VAT rate
    today = date.today()
    current_vat_rate = None
    for r in vat_rates:
        if r.start_date <= today <= r.end_date:
            current_vat_rate = r.rate
            break

    fiscal_rep_summary = None
    if fiscal_rep:
        fiscal_rep_summary = {
            "id": str(fiscal_rep.id),
            "company_name": fiscal_rep.company_name,
            "vat_number": fiscal_rep.vat_number,
            "conference_vat_number": fiscal_rep.conference_vat_number,
            "is_active": fiscal_rep.is_active,
        }

    return TaxInfoResponse(
        representation_type=representation_type,
        tenant_country=tenant_country,
        conference_country=conference_country,
        effective_vat_number=effective_vat_number,
        current_vat_rate=current_vat_rate,
        fiscal_representative=fiscal_rep_summary,
        vat_rates=[ConferenceVatRateResponse.model_validate(r) for r in vat_rates],
    )
