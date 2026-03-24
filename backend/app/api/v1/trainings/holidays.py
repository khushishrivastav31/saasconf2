"""Holiday configuration and proxy endpoints."""

import time
from typing import Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Query, Request
from sqlalchemy import literal, select

from app.core.dependencies import DbSessionDep, TenantAdminDep, get_client_ip
from app.models.audit import AuditLog
from app.models.holiday_config import CustomBlockedDay, TenantHolidayConfig
from app.schemas.holiday import (
    AvailableCountry,
    CountrySubdivision,
    CustomBlockedDayCreate,
    CustomBlockedDayResponse,
    CustomBlockedDayUpdate,
    HolidayConfigCreate,
    HolidayConfigResponse,
    HolidayConfigUpdate,
    PublicHolidayItem,
)

router = APIRouter(prefix="/holidays", tags=["holidays"])

NAGER_BASE = "https://date.nager.at/api/v3"

# Simple in-memory cache: key -> (timestamp, data)
_cache: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 86400  # 24 hours


async def _cached_get(url: str) -> Any:
    """Fetch from Nager.Date API with 24h caching."""
    now = time.time()
    if url in _cache:
        cached_at, data = _cache[url]
        if now - cached_at < _CACHE_TTL:
            return data

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    _cache[url] = (now, data)
    return data


def _tenant_filter(current_user: TenantAdminDep):
    if current_user.is_super_admin:
        return literal(True)
    return TenantHolidayConfig.tenant_id == current_user.tenant_id


def _blocked_day_tenant_filter(current_user: TenantAdminDep):
    if current_user.is_super_admin:
        return literal(True)
    return CustomBlockedDay.tenant_id == current_user.tenant_id


# ---------------------------------------------------------------------------
# Proxy endpoints (Nager.Date API)
# ---------------------------------------------------------------------------


@router.get("/countries", response_model=list[AvailableCountry])
async def list_countries(
    current_user: TenantAdminDep,
) -> list[AvailableCountry]:
    """List available countries from Nager.Date."""
    data = await _cached_get(f"{NAGER_BASE}/AvailableCountries")
    return [AvailableCountry(country_code=c["countryCode"], name=c["name"]) for c in data]


@router.get("/{country_code}/{year}", response_model=list[PublicHolidayItem])
async def list_public_holidays(
    country_code: str,
    year: int,
    current_user: TenantAdminDep,
) -> list[PublicHolidayItem]:
    """Fetch public holidays for a country and year from Nager.Date."""
    cc = country_code.upper()
    data = await _cached_get(f"{NAGER_BASE}/PublicHolidays/{year}/{cc}")
    return [
        PublicHolidayItem(
            date=h["date"],
            local_name=h["localName"],
            name=h["name"],
            country_code=h["countryCode"],
            is_global=h.get("global", False),
            counties=h.get("counties"),
            types=h.get("types", []),
        )
        for h in data
    ]


@router.get("/{country_code}/subdivisions", response_model=list[CountrySubdivision])
async def list_subdivisions(
    country_code: str,
    current_user: TenantAdminDep,
) -> list[CountrySubdivision]:
    """List subdivisions (e.g. Bundesländer) for a country."""
    cc = country_code.upper()
    # Extract subdivisions from holiday counties field (more reliable than CountryInfo borders)
    holidays_data = await _cached_get(f"{NAGER_BASE}/PublicHolidays/2026/{cc}")
    codes: set[str] = set()
    for h in holidays_data:
        if h.get("counties"):
            codes.update(h["counties"])

    # Format subdivision names from codes (e.g. "DE-BW" -> "BW")
    return sorted(
        [CountrySubdivision(code=code, name=code.split("-", 1)[1] if "-" in code else code) for code in codes],
        key=lambda s: s.code,
    )


# ---------------------------------------------------------------------------
# Holiday config CRUD (tenant-scoped)
# ---------------------------------------------------------------------------


@router.get("/config", response_model=list[HolidayConfigResponse])
async def list_holiday_configs(
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> list[HolidayConfigResponse]:
    """List holiday configurations for the tenant."""
    query = (
        select(TenantHolidayConfig)
        .where(_tenant_filter(current_user))
        .order_by(TenantHolidayConfig.year.desc(), TenantHolidayConfig.country_code)
    )
    result = await db.execute(query)
    configs = list(result.scalars().all())
    return [HolidayConfigResponse.model_validate(c) for c in configs]


@router.post("/config", response_model=HolidayConfigResponse, status_code=201)
async def create_holiday_config(
    payload: HolidayConfigCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> HolidayConfigResponse:
    """Create a holiday configuration."""
    # Check uniqueness
    existing = await db.execute(
        select(TenantHolidayConfig).where(
            TenantHolidayConfig.tenant_id == current_user.tenant_id,
            TenantHolidayConfig.country_code == payload.country_code,
            TenantHolidayConfig.year == payload.year,
        )
    )
    if existing.scalar_one_or_none():
        from app.core.exceptions import ConflictError

        raise ConflictError(f"Holiday config for {payload.country_code} {payload.year} already exists")

    config = TenantHolidayConfig(
        tenant_id=current_user.tenant_id,
        country_code=payload.country_code,
        year=payload.year,
        regional_code=payload.regional_code,
    )
    db.add(config)
    await db.flush()

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="holiday_config.create",
        resource_type="holiday_config",
        resource_id=config.id,
        details={"country_code": payload.country_code, "year": payload.year},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(config)

    return HolidayConfigResponse.model_validate(config)


@router.put("/config/{config_id}", response_model=HolidayConfigResponse)
async def update_holiday_config(
    config_id: UUID,
    payload: HolidayConfigUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> HolidayConfigResponse:
    """Update a holiday configuration."""
    result = await db.execute(
        select(TenantHolidayConfig).where(
            TenantHolidayConfig.id == config_id,
            _tenant_filter(current_user),
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Holiday config not found")

    if payload.national_holidays_enabled is not None:
        config.national_holidays_enabled = payload.national_holidays_enabled
    if payload.regional_holidays_enabled is not None:
        config.regional_holidays_enabled = payload.regional_holidays_enabled
    if payload.regional_code is not None:
        config.regional_code = payload.regional_code or None

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="holiday_config.update",
        resource_type="holiday_config",
        resource_id=config.id,
        details={"country_code": config.country_code, "year": config.year},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(config)

    return HolidayConfigResponse.model_validate(config)


@router.delete("/config/{config_id}")
async def delete_holiday_config(
    config_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a holiday configuration."""
    result = await db.execute(
        select(TenantHolidayConfig).where(
            TenantHolidayConfig.id == config_id,
            _tenant_filter(current_user),
        )
    )
    config = result.scalar_one_or_none()
    if not config:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Holiday config not found")

    details = {"country_code": config.country_code, "year": config.year}
    await db.delete(config)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="holiday_config.delete",
        resource_type="holiday_config",
        resource_id=config_id,
        details=details,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "Holiday config deleted"}


# ---------------------------------------------------------------------------
# Custom blocked days CRUD (tenant-scoped)
# ---------------------------------------------------------------------------


@router.get("/blocked-days", response_model=list[CustomBlockedDayResponse])
async def list_blocked_days(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    year: int | None = Query(None, ge=2020, le=2099),
) -> list[CustomBlockedDayResponse]:
    """List custom blocked days for the tenant, optionally filtered by year."""
    query = select(CustomBlockedDay).where(_blocked_day_tenant_filter(current_user))
    if year is not None:
        query = query.where(CustomBlockedDay.year == year)
    query = query.order_by(CustomBlockedDay.date)
    result = await db.execute(query)
    days = list(result.scalars().all())
    return [CustomBlockedDayResponse.model_validate(d) for d in days]


@router.post("/blocked-days", response_model=CustomBlockedDayResponse, status_code=201)
async def create_blocked_day(
    payload: CustomBlockedDayCreate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> CustomBlockedDayResponse:
    """Create a custom blocked day."""
    # Check uniqueness
    existing = await db.execute(
        select(CustomBlockedDay).where(
            CustomBlockedDay.tenant_id == current_user.tenant_id,
            CustomBlockedDay.date == payload.date,
        )
    )
    if existing.scalar_one_or_none():
        from app.core.exceptions import ConflictError

        raise ConflictError(f"Blocked day for {payload.date} already exists")

    blocked_day = CustomBlockedDay(
        tenant_id=current_user.tenant_id,
        date=payload.date,
        name=payload.name,
        year=payload.date.year,
        is_recurring=payload.is_recurring,
    )
    db.add(blocked_day)
    await db.flush()

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="blocked_day.create",
        resource_type="blocked_day",
        resource_id=blocked_day.id,
        details={"date": str(payload.date), "name": payload.name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(blocked_day)

    return CustomBlockedDayResponse.model_validate(blocked_day)


@router.put("/blocked-days/{day_id}", response_model=CustomBlockedDayResponse)
async def update_blocked_day(
    day_id: UUID,
    payload: CustomBlockedDayUpdate,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> CustomBlockedDayResponse:
    """Update a custom blocked day."""
    result = await db.execute(
        select(CustomBlockedDay).where(
            CustomBlockedDay.id == day_id,
            _blocked_day_tenant_filter(current_user),
        )
    )
    blocked_day = result.scalar_one_or_none()
    if not blocked_day:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Blocked day not found")

    if payload.name is not None:
        blocked_day.name = payload.name
    if payload.is_recurring is not None:
        blocked_day.is_recurring = payload.is_recurring

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="blocked_day.update",
        resource_type="blocked_day",
        resource_id=blocked_day.id,
        details={"date": str(blocked_day.date), "name": blocked_day.name},
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()
    await db.refresh(blocked_day)

    return CustomBlockedDayResponse.model_validate(blocked_day)


@router.delete("/blocked-days/{day_id}")
async def delete_blocked_day(
    day_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
    request: Request,
) -> dict:
    """Delete a custom blocked day."""
    result = await db.execute(
        select(CustomBlockedDay).where(
            CustomBlockedDay.id == day_id,
            _blocked_day_tenant_filter(current_user),
        )
    )
    blocked_day = result.scalar_one_or_none()
    if not blocked_day:
        from app.core.exceptions import NotFoundError

        raise NotFoundError("Blocked day not found")

    details = {"date": str(blocked_day.date), "name": blocked_day.name}
    await db.delete(blocked_day)

    audit_log = AuditLog(
        tenant_id=current_user.tenant_id,
        user_id=current_user.user_id,
        action="blocked_day.delete",
        resource_type="blocked_day",
        resource_id=day_id,
        details=details,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    db.add(audit_log)
    await db.commit()

    return {"message": "Blocked day deleted"}
