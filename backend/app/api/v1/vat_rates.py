"""VAT rates API endpoints for tenant-specific country VAT rates management."""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import or_, select

from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.models.vat_rate_by_country import VatRateByCountry
from app.schemas.vat_rate import VatRateByCountryCreate, VatRateByCountryResponse, VatRateByCountryUpdate

router = APIRouter()


@router.get("/vat-rates", response_model=list[VatRateByCountryResponse])
async def list_vat_rates(
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> list[VatRateByCountry]:
    """
    List tenant's country VAT rates.

    Returns VAT rates for the current tenant, falling back to global rates (tenant_id=NULL)
    if the tenant hasn't defined any.
    """
    # Get tenant-specific rates
    stmt = (
        select(VatRateByCountry)
        .where(
            or_(
                VatRateByCountry.tenant_id == current_user.tenant_id,
                VatRateByCountry.tenant_id.is_(None),  # Global rates for backward compatibility
            )
        )
        .order_by(VatRateByCountry.country_name)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/vat-rates", response_model=VatRateByCountryResponse)
async def create_vat_rate(
    data: VatRateByCountryCreate,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> VatRateByCountry:
    """
    Create a new country VAT rate for the tenant.

    Allows tenants to define VAT/GST/Sales Tax rates for any country.
    """
    # Check if rate already exists for this tenant + country
    stmt = select(VatRateByCountry).where(
        VatRateByCountry.tenant_id == current_user.tenant_id,
        VatRateByCountry.country_code == data.country_code.upper(),
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"VAT rate for {data.country_code.upper()} already exists for your tenant",
        )

    vat_rate = VatRateByCountry(
        tenant_id=current_user.tenant_id,
        country_code=data.country_code.upper(),
        country_name=data.country_name,
        standard_rate=data.standard_rate,
    )

    db.add(vat_rate)
    await db.commit()
    await db.refresh(vat_rate)
    return vat_rate


@router.put("/vat-rates/{vat_rate_id}", response_model=VatRateByCountryResponse)
async def update_vat_rate(
    vat_rate_id: UUID,
    update: VatRateByCountryUpdate,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> VatRateByCountry:
    """
    Update a country VAT rate for the tenant.

    Changes affect future invoice calculations only. Existing invoices are not recalculated.
    """
    stmt = select(VatRateByCountry).where(
        VatRateByCountry.id == vat_rate_id,
        VatRateByCountry.tenant_id == current_user.tenant_id,
    )
    result = await db.execute(stmt)
    vat_rate = result.scalar_one_or_none()

    if not vat_rate:
        raise HTTPException(status_code=404, detail="VAT rate not found")

    if update.country_name is not None:
        vat_rate.country_name = update.country_name
    if update.standard_rate is not None:
        vat_rate.standard_rate = update.standard_rate
    vat_rate.updated_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(vat_rate)
    return vat_rate


@router.delete("/vat-rates/{vat_rate_id}")
async def delete_vat_rate(
    vat_rate_id: UUID,
    db: DbSessionDep,
    current_user: CurrentUserDep,
) -> dict:
    """
    Delete a country VAT rate for the tenant.

    Note: This only affects future invoices. Existing invoices are not recalculated.
    """
    stmt = select(VatRateByCountry).where(
        VatRateByCountry.id == vat_rate_id,
        VatRateByCountry.tenant_id == current_user.tenant_id,
    )
    result = await db.execute(stmt)
    vat_rate = result.scalar_one_or_none()

    if not vat_rate:
        raise HTTPException(status_code=404, detail="VAT rate not found")

    await db.delete(vat_rate)
    await db.commit()

    return {"message": "VAT rate deleted successfully"}
