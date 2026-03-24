"""Tests for the aggregated holiday dates endpoint (GET /trainings/holidays/dates/{year})."""

import os
import uuid
from datetime import date
from unittest.mock import AsyncMock, patch

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.holiday_config import CustomBlockedDay, TenantHolidayConfig
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import auth_headers


# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User, modules: list[str] | None = None) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


def _url(year: int) -> str:
    return f"/api/v1/trainings/holidays/dates/{year}"


# Sample Nager.Date response for Germany 2026
NAGER_HOLIDAYS_DE_2026 = [
    {
        "date": "2026-01-01",
        "localName": "Neujahrstag",
        "name": "New Year's Day",
        "countryCode": "DE",
        "global": True,
        "counties": None,
        "types": ["Public"],
    },
    {
        "date": "2026-01-06",
        "localName": "Heilige Drei Könige",
        "name": "Epiphany",
        "countryCode": "DE",
        "global": False,
        "counties": ["DE-BW", "DE-BY", "DE-ST"],
        "types": ["Public"],
    },
    {
        "date": "2026-12-25",
        "localName": "Erster Weihnachtstag",
        "name": "Christmas Day",
        "countryCode": "DE",
        "global": True,
        "counties": None,
        "types": ["Public"],
    },
]


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest.fixture()
def admin_token(tenant_admin_user: User) -> str:
    return _make_token(tenant_admin_user, modules=["trainings"])


@pytest_asyncio.fixture()
async def holiday_config(db_session: AsyncSession, tenant: Tenant) -> TenantHolidayConfig:
    config = TenantHolidayConfig(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        country_code="DE",
        year=2026,
        national_holidays_enabled=True,
        regional_holidays_enabled=False,
    )
    db_session.add(config)
    await db_session.commit()
    await db_session.refresh(config)
    return config


@pytest_asyncio.fixture()
async def regional_config(db_session: AsyncSession, tenant: Tenant) -> TenantHolidayConfig:
    config = TenantHolidayConfig(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        country_code="DE",
        year=2026,
        national_holidays_enabled=True,
        regional_holidays_enabled=True,
        regional_code="DE-BW",
    )
    db_session.add(config)
    await db_session.commit()
    await db_session.refresh(config)
    return config


@pytest_asyncio.fixture()
async def blocked_day(db_session: AsyncSession, tenant: Tenant) -> CustomBlockedDay:
    day = CustomBlockedDay(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        date=date(2026, 3, 15),
        name="Company Retreat",
        year=2026,
        is_recurring=False,
    )
    db_session.add(day)
    await db_session.commit()
    await db_session.refresh(day)
    return day


@pytest_asyncio.fixture()
async def recurring_blocked_day(db_session: AsyncSession, tenant: Tenant) -> CustomBlockedDay:
    day = CustomBlockedDay(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        date=date(2025, 7, 4),
        name="Annual Party",
        year=2025,
        is_recurring=True,
    )
    db_session.add(day)
    await db_session.commit()
    await db_session.refresh(day)
    return day


def _mock_nager(url: str):
    """Return mock Nager.Date data based on URL."""
    if "PublicHolidays/2026/DE" in url:
        return NAGER_HOLIDAYS_DE_2026
    return []


# ── Tests ──────────────────────────────────────────────────────────────


class TestHolidayDatesEndpoint:
    """Tests for GET /trainings/holidays/dates/{year}."""

    @pytest.mark.asyncio
    async def test_empty_when_no_configs(
        self, client: AsyncClient, admin_token: str
    ):
        """Returns empty list when no holiday configs exist."""
        resp = await client.get(
            _url(2026), headers=auth_headers(admin_token)
        )
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_returns_national_holidays(
        self,
        client: AsyncClient,
        admin_token: str,
        holiday_config: TenantHolidayConfig,
    ):
        """Returns national holidays when config has national enabled."""
        with patch(
            "app.api.v1.trainings.holidays._cached_get",
            new_callable=AsyncMock,
            side_effect=_mock_nager,
        ):
            resp = await client.get(
                _url(2026), headers=auth_headers(admin_token)
            )

        assert resp.status_code == 200
        data = resp.json()
        dates = [e["date"] for e in data]
        # National holidays should be included
        assert "2026-01-01" in dates
        assert "2026-12-25" in dates
        # Regional-only holiday should NOT be included (regional disabled)
        assert "2026-01-06" not in dates

    @pytest.mark.asyncio
    async def test_includes_regional_holidays(
        self,
        client: AsyncClient,
        admin_token: str,
        regional_config: TenantHolidayConfig,
    ):
        """Includes regional holidays matching the configured subdivision."""
        with patch(
            "app.api.v1.trainings.holidays._cached_get",
            new_callable=AsyncMock,
            side_effect=_mock_nager,
        ):
            resp = await client.get(
                _url(2026), headers=auth_headers(admin_token)
            )

        assert resp.status_code == 200
        data = resp.json()
        dates = [e["date"] for e in data]
        # National
        assert "2026-01-01" in dates
        # Regional for DE-BW
        assert "2026-01-06" in dates

    @pytest.mark.asyncio
    async def test_includes_custom_blocked_days(
        self,
        client: AsyncClient,
        admin_token: str,
        blocked_day: CustomBlockedDay,
    ):
        """Includes custom blocked days for the requested year."""
        resp = await client.get(
            _url(2026), headers=auth_headers(admin_token)
        )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["date"] == "2026-03-15"
        assert data[0]["name"] == "Company Retreat"
        assert data[0]["type"] == "custom"

    @pytest.mark.asyncio
    async def test_includes_recurring_blocked_days(
        self,
        client: AsyncClient,
        admin_token: str,
        recurring_blocked_day: CustomBlockedDay,
    ):
        """Recurring blocked days from other years are mapped to requested year."""
        resp = await client.get(
            _url(2026), headers=auth_headers(admin_token)
        )

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["date"] == "2026-07-04"
        assert data[0]["name"] == "Annual Party"
        assert data[0]["type"] == "custom"

    @pytest.mark.asyncio
    async def test_deduplicates_by_date(
        self,
        client: AsyncClient,
        admin_token: str,
        holiday_config: TenantHolidayConfig,
        db_session: AsyncSession,
        tenant: Tenant,
    ):
        """When a custom blocked day matches a public holiday date, first wins."""
        # Add a blocked day on Jan 1 (same as New Year)
        day = CustomBlockedDay(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            date=date(2026, 1, 1),
            name="Custom New Year",
            year=2026,
            is_recurring=False,
        )
        db_session.add(day)
        await db_session.commit()

        with patch(
            "app.api.v1.trainings.holidays._cached_get",
            new_callable=AsyncMock,
            side_effect=_mock_nager,
        ):
            resp = await client.get(
                _url(2026), headers=auth_headers(admin_token)
            )

        assert resp.status_code == 200
        data = resp.json()
        jan1_entries = [e for e in data if e["date"] == "2026-01-01"]
        # Should have exactly one entry (dedup)
        assert len(jan1_entries) == 1

    @pytest.mark.asyncio
    async def test_sorted_by_date(
        self,
        client: AsyncClient,
        admin_token: str,
        holiday_config: TenantHolidayConfig,
        blocked_day: CustomBlockedDay,
    ):
        """Result is sorted by date."""
        with patch(
            "app.api.v1.trainings.holidays._cached_get",
            new_callable=AsyncMock,
            side_effect=_mock_nager,
        ):
            resp = await client.get(
                _url(2026), headers=auth_headers(admin_token)
            )

        assert resp.status_code == 200
        data = resp.json()
        dates = [e["date"] for e in data]
        assert dates == sorted(dates)

    @pytest.mark.asyncio
    async def test_type_field_correct(
        self,
        client: AsyncClient,
        admin_token: str,
        holiday_config: TenantHolidayConfig,
        blocked_day: CustomBlockedDay,
    ):
        """Public holidays have type='public', blocked days have type='custom'."""
        with patch(
            "app.api.v1.trainings.holidays._cached_get",
            new_callable=AsyncMock,
            side_effect=_mock_nager,
        ):
            resp = await client.get(
                _url(2026), headers=auth_headers(admin_token)
            )

        assert resp.status_code == 200
        data = resp.json()
        type_map = {e["date"]: e["type"] for e in data}
        assert type_map["2026-01-01"] == "public"
        assert type_map["2026-03-15"] == "custom"


class TestTenantIsolation:
    """Holiday dates respect tenant isolation."""

    @pytest.mark.asyncio
    async def test_other_tenant_config_not_visible(
        self,
        client: AsyncClient,
        admin_token: str,
        db_session: AsyncSession,
    ):
        """Holiday configs from another tenant are not included."""
        # Create another tenant with a holiday config
        other_tenant = Tenant(
            id=uuid.uuid4(),
            name="Other Corp",
            slug=f"other-{uuid.uuid4().hex[:8]}",
            is_active=True,
        )
        db_session.add(other_tenant)
        await db_session.flush()

        other_config = TenantHolidayConfig(
            id=uuid.uuid4(),
            tenant_id=other_tenant.id,
            country_code="US",
            year=2026,
            national_holidays_enabled=True,
        )
        db_session.add(other_config)
        await db_session.commit()

        resp = await client.get(
            _url(2026), headers=auth_headers(admin_token)
        )
        assert resp.status_code == 200
        assert resp.json() == []
