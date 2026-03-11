"""Portal currencies endpoint — read-only access to conference currencies."""

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.models.settings import ConferenceCurrency

router = APIRouter()


class PortalCurrencyItem(BaseModel):
    code: str
    name: str
    symbol: str
    model_config = ConfigDict(from_attributes=True)


class PortalCurrencyListResponse(BaseModel):
    items: list[PortalCurrencyItem]


@router.get("/portal/currencies", response_model=PortalCurrencyListResponse)
async def list_currencies(
    applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalCurrencyListResponse:
    """List active currencies available across the applicant's conferences."""
    result = await db.execute(
        select(ConferenceCurrency)
        .where(
            ConferenceCurrency.tenant_id == applicant.tenant_id,
            ConferenceCurrency.is_active.is_(True),
        )
        .order_by(ConferenceCurrency.code)
    )
    rows = result.scalars().all()

    # Deduplicate by code (currencies may exist per-conference)
    seen: dict[str, PortalCurrencyItem] = {}
    for row in rows:
        if row.code not in seen:
            seen[row.code] = PortalCurrencyItem.model_validate(row)

    return PortalCurrencyListResponse(items=list(seen.values()))
