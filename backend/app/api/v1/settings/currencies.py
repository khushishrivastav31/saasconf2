"""Currencies CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Request
from sqlalchemy import func, select
from sqlalchemy import update as sql_update

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    get_client_ip,
)
from app.core.exceptions import NotFoundError, ValidationError
from app.models.audit import AuditLog
from app.models.settings import ConferenceCurrency, SponsorPackage
from app.schemas.settings import (
    CurrencyCreate,
    CurrencyListResponse,
    CurrencyResponse,
    CurrencyUpdate,
)

from ._shared import _resolve_conference, _check_conference_admin

router = APIRouter()


@router.get("/currencies", response_model=CurrencyListResponse)
async def list_currencies(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> CurrencyListResponse:
    """List all currencies for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)

    query = (
        select(ConferenceCurrency)
        .where(
            ConferenceCurrency.conference_id == conference.id,
            ConferenceCurrency.tenant_id == conference.tenant_id,
        )
        .order_by(ConferenceCurrency.code)
    )
    result = await db.execute(query)
    currencies = result.scalars().all()

    items = [
        CurrencyResponse(
            id=c.id,
            tenant_id=c.tenant_id,
            conference_id=c.conference_id,
            code=c.code,
            name=c.name,
            symbol=c.symbol,
            is_active=c.is_active,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in currencies
    ]

    return CurrencyListResponse(items=items, total=len(items))


@router.post("/currencies", response_model=CurrencyResponse)
async def create_currency(
    conference_id: UUID,
    currency_data: CurrencyCreate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> CurrencyResponse:
    """Create a new currency for a conference."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    # Check unique code within conference
    existing = await db.execute(
        select(ConferenceCurrency).where(
            ConferenceCurrency.conference_id == conference.id,
            ConferenceCurrency.tenant_id == conference.tenant_id,
            ConferenceCurrency.code == currency_data.code,
        )
    )
    if existing.scalar_one_or_none():
        raise ValidationError(f"A currency with code '{currency_data.code}' already exists")

    currency = ConferenceCurrency(
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        code=currency_data.code,
        name=currency_data.name,
        symbol=currency_data.symbol,
        is_active=currency_data.is_active,
    )
    db.add(currency)

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="currency.create",
        resource_type="currency",
        resource_id=currency.id,
        details={"code": currency.code, "conference_id": str(conference.id)},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(currency)

    return CurrencyResponse(
        id=currency.id,
        tenant_id=currency.tenant_id,
        conference_id=currency.conference_id,
        code=currency.code,
        name=currency.name,
        symbol=currency.symbol,
        is_active=currency.is_active,
        created_at=currency.created_at,
        updated_at=currency.updated_at,
    )


@router.put("/currencies/{currency_id}", response_model=CurrencyResponse)
async def update_currency(
    conference_id: UUID,
    currency_id: UUID,
    currency_data: CurrencyUpdate,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> CurrencyResponse:
    """Update an existing currency."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(ConferenceCurrency).where(
            ConferenceCurrency.id == currency_id,
            ConferenceCurrency.conference_id == conference.id,
        )
    )
    currency = result.scalar_one_or_none()
    if not currency:
        raise NotFoundError(f"Currency with ID '{currency_id}' not found")

    # If code is changing, check uniqueness
    if currency_data.code is not None and currency_data.code != currency.code:
        existing = await db.execute(
            select(ConferenceCurrency).where(
                ConferenceCurrency.conference_id == conference.id,
                ConferenceCurrency.tenant_id == conference.tenant_id,
                ConferenceCurrency.code == currency_data.code,
                ConferenceCurrency.id != currency_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValidationError(f"A currency with code '{currency_data.code}' already exists")

    old_code = currency.code
    update_data = currency_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(currency, field, value)

    # If code changed, update all sponsor packages using the old code
    if currency_data.code is not None and currency_data.code != old_code:
        await db.execute(
            sql_update(SponsorPackage)
            .where(
                SponsorPackage.conference_id == conference.id,
                SponsorPackage.currency == old_code,
            )
            .values(currency=currency_data.code)
        )

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="currency.update",
        resource_type="currency",
        resource_id=currency.id,
        details={"updated_fields": list(update_data.keys())},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.commit()
    await db.refresh(currency)

    return CurrencyResponse(
        id=currency.id,
        tenant_id=currency.tenant_id,
        conference_id=currency.conference_id,
        code=currency.code,
        name=currency.name,
        symbol=currency.symbol,
        is_active=currency.is_active,
        created_at=currency.created_at,
        updated_at=currency.updated_at,
    )


@router.delete("/currencies/{currency_id}")
async def delete_currency(
    conference_id: UUID,
    currency_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a currency. Blocked if sponsor packages are using this currency."""
    conference = await _resolve_conference(conference_id, current_user, db)
    await _check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(ConferenceCurrency).where(
            ConferenceCurrency.id == currency_id,
            ConferenceCurrency.conference_id == conference.id,
        )
    )
    currency = result.scalar_one_or_none()
    if not currency:
        raise NotFoundError(f"Currency with ID '{currency_id}' not found")

    # Check if any sponsor packages use this currency
    usage_count = (
        await db.execute(
            select(func.count()).where(
                SponsorPackage.conference_id == conference.id,
                SponsorPackage.currency == currency.code,
            )
        )
    ).scalar() or 0

    if usage_count > 0:
        raise ValidationError(
            f"Cannot delete currency '{currency.code}': {usage_count} sponsor package(s) are using it"
        )

    currency_code = currency.code

    audit_log = AuditLog(
        tenant_id=conference.tenant_id,
        user_id=current_user.user_id,
        action="currency.delete",
        resource_type="currency",
        resource_id=currency.id,
        details={"code": currency_code},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)

    await db.delete(currency)
    await db.commit()

    return {"message": f"Currency '{currency_code}' deleted successfully"}
