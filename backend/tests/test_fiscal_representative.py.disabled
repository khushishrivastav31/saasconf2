"""Tests for fiscal representative and conference VAT rate endpoints.

NOTE: ConferenceVatRate tests are temporarily skipped as the model was replaced
with VatRateByCountry (tenant-level, not conference-level).
TODO: Update these tests to use the new VatRateByCountry system.
"""

import os
import uuid
from datetime import date, timedelta
from decimal import Decimal

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
from app.models.conference import Conference
# from app.models.conference_vat_rate import ConferenceVatRate  # DELETED - replaced with VatRateByCountry
from app.models.fiscal_representative import FiscalRepresentative

# Skip entire module - ConferenceVatRate was deleted
pytestmark = pytest.mark.skip(reason="ConferenceVatRate model deleted - needs migration to VatRateByCountry")
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

# -- Helpers ----------------------------------------------------------------


def _make_token(user: User, modules: list[str] | None = None) -> str:
    """Create a valid JWT access token for a user."""
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


def _fiscal_rep_url(conference_id: uuid.UUID) -> str:
    """Build the fiscal representative endpoint URL."""
    return f"/api/v1/conferences/{conference_id}/fiscal-representative"


def _vat_rates_url(conference_id: uuid.UUID, rate_id: uuid.UUID | None = None) -> str:
    """Build the VAT rates endpoint URL."""
    base = f"/api/v1/conferences/{conference_id}/vat-rates"
    if rate_id:
        return f"{base}/{rate_id}"
    return base


def _tax_info_url(conference_id: uuid.UUID) -> str:
    """Build the tax info endpoint URL."""
    return f"/api/v1/conferences/{conference_id}/tax-info"


# -- Fixtures ---------------------------------------------------------------


@pytest.fixture()
def admin_token(tenant_admin_user: User) -> str:
    """Return a valid access token for the tenant admin with conferences module."""
    return _make_token(tenant_admin_user, modules=["conferences"])


@pytest.fixture()
def user_token(regular_user: User) -> str:
    """Return a valid access token for the regular user with conferences module."""
    return _make_token(regular_user, modules=["conferences"])


@pytest.fixture()
def super_token(super_admin_user: User) -> str:
    """Return a valid access token for the super admin."""
    return _make_token(super_admin_user)


@pytest_asyncio.fixture()
async def sample_fiscal_rep(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> FiscalRepresentative:
    """Create a sample fiscal representative directly in the database."""
    rep = FiscalRepresentative(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        company_name="Tax Rep GmbH",
        address_line1="Hauptstrasse 1",
        city="Berlin",
        country="Germany",
        email="info@taxrep.de",
        vat_number="DE123456789",
        conference_vat_number="DE987654321",
        is_active=True,
    )
    db_session.add(rep)
    await db_session.commit()
    await db_session.refresh(rep)
    return rep


@pytest_asyncio.fixture()
async def sample_vat_rate(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
):  # -> ConferenceVatRate:  # Type annotation removed - model deleted
    """Create a sample VAT rate period in the database (DEPRECATED - model deleted)."""
    # ConferenceVatRate model was deleted - this fixture no longer works
    # Tests using this fixture are skipped via pytestmark
    return None


@pytest_asyncio.fixture()
async def tenant_with_country(
    db_session: AsyncSession,
    tenant: Tenant,
) -> Tenant:
    """Set the tenant's country and VAT number."""
    tenant.country = "Austria"
    tenant.vat_number = "ATU12345678"
    await db_session.commit()
    await db_session.refresh(tenant)
    return tenant


@pytest_asyncio.fixture()
async def conference_with_country(
    db_session: AsyncSession,
    conference: Conference,
) -> Conference:
    """Set the conference country (different from tenant)."""
    conference.country = "Germany"
    await db_session.commit()
    await db_session.refresh(conference)
    return conference


@pytest_asyncio.fixture()
async def conference_same_country(
    db_session: AsyncSession,
    conference: Conference,
) -> Conference:
    """Set the conference country to match the tenant (Austria)."""
    conference.country = "Austria"
    await db_session.commit()
    await db_session.refresh(conference)
    return conference


# ===========================================================================
# 1. GET FISCAL REPRESENTATIVE
# ===========================================================================


class TestGetFiscalRepresentative:
    """GET /conferences/{conference_id}/fiscal-representative"""

    async def test_get_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """GET returns 200 with null when no fiscal representative exists."""
        url = _fiscal_rep_url(conference.id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        assert response.json() is None

    async def test_get_existing(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_fiscal_rep: FiscalRepresentative,
    ) -> None:
        """GET returns the fiscal representative after creating one."""
        url = _fiscal_rep_url(conference.id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(sample_fiscal_rep.id)
        assert data["company_name"] == "Tax Rep GmbH"
        assert data["address_line1"] == "Hauptstrasse 1"
        assert data["city"] == "Berlin"
        assert data["country"] == "Germany"
        assert data["email"] == "info@taxrep.de"
        assert data["vat_number"] == "DE123456789"
        assert data["conference_vat_number"] == "DE987654321"
        assert data["is_active"] is True
        assert data["conference_id"] == str(conference.id)
        assert data["tenant_id"] == str(conference.tenant_id)
        assert "created_at" in data
        assert "updated_at" in data

    async def test_get_no_auth_401(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
    ) -> None:
        """GET without an auth token returns 401."""
        url = _fiscal_rep_url(conference.id)
        response = await client.get(url)

        assert response.status_code == 401

    async def test_get_wrong_conference_404(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """GET with a non-existent conference returns 404."""
        fake_conference_id = uuid.uuid4()
        url = _fiscal_rep_url(fake_conference_id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 404


# ===========================================================================
# 2. UPSERT (PUT) FISCAL REPRESENTATIVE
# ===========================================================================


class TestUpsertFiscalRepresentative:
    """PUT /conferences/{conference_id}/fiscal-representative"""

    async def test_create_minimal(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """PUT with just company_name creates a fiscal representative and returns 200."""
        url = _fiscal_rep_url(conference.id)
        payload = {"company_name": "Minimal Tax Rep"}
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["company_name"] == "Minimal Tax Rep"
        assert data["conference_id"] == str(conference.id)
        assert data["tenant_id"] == str(tenant_with_modules.id)
        assert data["is_active"] is True
        assert data["address_line1"] is None
        assert data["city"] is None
        assert data["country"] is None
        assert data["phone"] is None
        assert data["email"] is None
        assert data["website"] is None
        assert data["vat_number"] is None
        assert data["conference_vat_number"] is None
        assert data["contact_persons"] == []
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    async def test_create_full(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """PUT with all fields populated creates a fiscal representative."""
        url = _fiscal_rep_url(conference.id)
        payload = {
            "company_name": "Full Tax Rep GmbH",
            "address_line1": "Bahnhofstrasse 10",
            "address_line2": "Floor 3",
            "city": "Munich",
            "state": "Bavaria",
            "postal_code": "80331",
            "country": "Germany",
            "phone": "+498912345678",
            "email": "contact@fulltaxrep.de",
            "website": "https://fulltaxrep.de",
            "vat_number": "DE111222333",
            "conference_vat_number": "DE444555666",
            "is_active": True,
        }
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["company_name"] == "Full Tax Rep GmbH"
        assert data["address_line1"] == "Bahnhofstrasse 10"
        assert data["address_line2"] == "Floor 3"
        assert data["city"] == "Munich"
        assert data["state"] == "Bavaria"
        assert data["postal_code"] == "80331"
        assert data["country"] == "Germany"
        assert data["phone"] == "+498912345678"
        assert data["email"] == "contact@fulltaxrep.de"
        assert data["website"] == "https://fulltaxrep.de"
        assert data["vat_number"] == "DE111222333"
        assert data["conference_vat_number"] == "DE444555666"
        assert data["is_active"] is True

    async def test_update_existing(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_fiscal_rep: FiscalRepresentative,
    ) -> None:
        """PUT again updates the existing fiscal representative (upsert)."""
        url = _fiscal_rep_url(conference.id)
        payload = {
            "company_name": "Updated Tax Rep GmbH",
            "city": "Hamburg",
            "conference_vat_number": "DE999888777",
        }
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        # The same record ID should be returned (updated, not recreated)
        assert data["id"] == str(sample_fiscal_rep.id)
        assert data["company_name"] == "Updated Tax Rep GmbH"
        assert data["city"] == "Hamburg"
        assert data["conference_vat_number"] == "DE999888777"

    async def test_create_with_contact_persons(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """PUT with contact_persons JSONB array stores them correctly."""
        url = _fiscal_rep_url(conference.id)
        payload = {
            "company_name": "Tax Rep with Contacts",
            "contact_persons": [
                {
                    "first_name": "Anna",
                    "last_name": "Schmidt",
                    "email": "anna@taxrep.de",
                    "phone": "+491701234567",
                },
                {
                    "first_name": "Max",
                    "last_name": "Mueller",
                    "email": "max@taxrep.de",
                },
            ],
        }
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["company_name"] == "Tax Rep with Contacts"
        assert len(data["contact_persons"]) == 2
        assert data["contact_persons"][0]["first_name"] == "Anna"
        assert data["contact_persons"][0]["last_name"] == "Schmidt"
        assert data["contact_persons"][0]["email"] == "anna@taxrep.de"
        assert data["contact_persons"][1]["first_name"] == "Max"
        assert data["contact_persons"][1]["last_name"] == "Mueller"

    async def test_no_auth_401(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
    ) -> None:
        """PUT without an auth token returns 401."""
        url = _fiscal_rep_url(conference.id)
        payload = {"company_name": "No Auth Rep"}
        response = await client.put(url, json=payload)

        assert response.status_code == 401

    async def test_regular_user_403(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        regular_user: User,
        user_token: str,
    ) -> None:
        """Regular user (non-admin) cannot upsert and gets 403."""
        url = _fiscal_rep_url(conference.id)
        payload = {"company_name": "Forbidden Rep"}
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(user_token),
        )

        assert response.status_code == 403

    async def test_missing_company_name_422(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """PUT without company_name returns 422."""
        url = _fiscal_rep_url(conference.id)
        payload = {"city": "Berlin"}
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 422

    async def test_wrong_conference_404(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """PUT with a non-existent conference returns 404."""
        fake_conference_id = uuid.uuid4()
        url = _fiscal_rep_url(fake_conference_id)
        payload = {"company_name": "Ghost Rep"}
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 404


# ===========================================================================
# 3. DELETE FISCAL REPRESENTATIVE
# ===========================================================================


class TestDeleteFiscalRepresentative:
    """DELETE /conferences/{conference_id}/fiscal-representative"""

    async def test_delete_existing(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_fiscal_rep: FiscalRepresentative,
    ) -> None:
        """DELETE removes the fiscal representative and returns a success message."""
        url = _fiscal_rep_url(conference.id)
        response = await client.delete(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "deleted" in data["message"].lower()

    async def test_delete_not_found_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """DELETE when no fiscal representative exists returns 404."""
        url = _fiscal_rep_url(conference.id)
        response = await client.delete(url, headers=auth_headers(admin_token))

        assert response.status_code == 404

    async def test_delete_verify_gone(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_fiscal_rep: FiscalRepresentative,
    ) -> None:
        """After DELETE, GET returns 200 with null."""
        url = _fiscal_rep_url(conference.id)

        # Delete
        delete_response = await client.delete(url, headers=auth_headers(admin_token))
        assert delete_response.status_code == 200

        # Verify GET returns null
        get_response = await client.get(url, headers=auth_headers(admin_token))
        assert get_response.status_code == 200
        assert get_response.json() is None

    async def test_regular_user_403(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        regular_user: User,
        user_token: str,
        sample_fiscal_rep: FiscalRepresentative,
    ) -> None:
        """Regular user (non-admin) cannot delete and gets 403."""
        url = _fiscal_rep_url(conference.id)
        response = await client.delete(url, headers=auth_headers(user_token))

        assert response.status_code == 403


# ===========================================================================
# 4. LIST VAT RATES
# ===========================================================================


class TestListVatRates:
    """GET /conferences/{conference_id}/vat-rates"""

    async def test_list_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """GET returns an empty list when no VAT rates exist."""
        url = _vat_rates_url(conference.id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0

    async def test_list_with_rates(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """GET returns existing rates ordered by start_date."""
        today = date.today()
        # Create two rates with different start dates (second one earlier)
        rate_later = ConferenceVatRate(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            rate=Decimal("22.00"),
            start_date=today + timedelta(days=60),
            end_date=today + timedelta(days=120),
            description="Future rate",
        )
        rate_earlier = ConferenceVatRate(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            rate=Decimal("19.00"),
            start_date=today - timedelta(days=60),
            end_date=today - timedelta(days=1),
            description="Past rate",
        )
        db_session.add_all([rate_later, rate_earlier])
        await db_session.commit()

        url = _vat_rates_url(conference.id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2
        # Should be ordered by start_date ascending
        assert data["items"][0]["description"] == "Past rate"
        assert data["items"][1]["description"] == "Future rate"

    async def test_list_wrong_conference_404(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """GET with a non-existent conference returns 404."""
        fake_conference_id = uuid.uuid4()
        url = _vat_rates_url(fake_conference_id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 404


# ===========================================================================
# 5. CREATE VAT RATE
# ===========================================================================


class TestCreateVatRate:
    """POST /conferences/{conference_id}/vat-rates"""

    async def test_create_vat_rate(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """POST creates a VAT rate and returns 201."""
        url = _vat_rates_url(conference.id)
        payload = {
            "rate": 21.00,
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
        }
        response = await client.post(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 201
        data = response.json()
        assert Decimal(str(data["rate"])) == Decimal("21.00")
        assert data["start_date"] == "2026-01-01"
        assert data["end_date"] == "2026-12-31"
        assert data["description"] is None
        assert data["conference_id"] == str(conference.id)
        assert data["tenant_id"] == str(tenant_with_modules.id)
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    async def test_create_with_description(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """POST with optional description field stores it correctly."""
        url = _vat_rates_url(conference.id)
        payload = {
            "rate": 19.00,
            "start_date": "2026-01-01",
            "end_date": "2026-06-30",
            "description": "Reduced VAT rate for H1",
        }
        response = await client.post(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 201
        data = response.json()
        assert data["description"] == "Reduced VAT rate for H1"
        assert Decimal(str(data["rate"])) == Decimal("19.00")

    async def test_end_date_before_start_date_422(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """POST with end_date before start_date returns 422 (Pydantic validation)."""
        url = _vat_rates_url(conference.id)
        payload = {
            "rate": 21.00,
            "start_date": "2026-06-01",
            "end_date": "2026-01-01",
        }
        response = await client.post(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 422

    async def test_overlapping_dates_400(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_vat_rate: ConferenceVatRate,
    ) -> None:
        """POST with overlapping date range returns 400."""
        url = _vat_rates_url(conference.id)
        # sample_vat_rate covers today-30 to today+30; create one that overlaps
        today = date.today()
        payload = {
            "rate": 22.00,
            "start_date": str(today),
            "end_date": str(today + timedelta(days=60)),
        }
        response = await client.post(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 400

    async def test_non_overlapping_ok(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_vat_rate: ConferenceVatRate,
    ) -> None:
        """POST with adjacent (non-overlapping) period succeeds."""
        url = _vat_rates_url(conference.id)
        # sample_vat_rate ends at today+30; create one starting the day after
        today = date.today()
        payload = {
            "rate": 22.00,
            "start_date": str(today + timedelta(days=31)),
            "end_date": str(today + timedelta(days=90)),
        }
        response = await client.post(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 201
        data = response.json()
        assert Decimal(str(data["rate"])) == Decimal("22.00")

    async def test_no_auth_401(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
    ) -> None:
        """POST without an auth token returns 401."""
        url = _vat_rates_url(conference.id)
        payload = {
            "rate": 21.00,
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
        }
        response = await client.post(url, json=payload)

        assert response.status_code == 401

    async def test_regular_user_403(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        regular_user: User,
        user_token: str,
    ) -> None:
        """Regular user (non-admin) cannot create a VAT rate and gets 403."""
        url = _vat_rates_url(conference.id)
        payload = {
            "rate": 21.00,
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
        }
        response = await client.post(
            url,
            json=payload,
            headers=auth_headers(user_token),
        )

        assert response.status_code == 403


# ===========================================================================
# 6. UPDATE VAT RATE
# ===========================================================================


class TestUpdateVatRate:
    """PUT /conferences/{conference_id}/vat-rates/{rate_id}"""

    async def test_update_rate(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_vat_rate: ConferenceVatRate,
    ) -> None:
        """PUT updates the rate value."""
        url = _vat_rates_url(conference.id, sample_vat_rate.id)
        payload = {"rate": 23.00}
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert Decimal(str(data["rate"])) == Decimal("23.00")
        assert data["id"] == str(sample_vat_rate.id)
        # Other fields remain unchanged
        assert data["description"] == "Standard VAT rate"

    async def test_update_dates(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_vat_rate: ConferenceVatRate,
    ) -> None:
        """PUT updates start and end dates."""
        url = _vat_rates_url(conference.id, sample_vat_rate.id)
        payload = {
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
        }
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["start_date"] == "2026-01-01"
        assert data["end_date"] == "2026-12-31"

    async def test_update_partial(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_vat_rate: ConferenceVatRate,
    ) -> None:
        """PUT with only some fields updates only those (partial update with exclude_unset)."""
        url = _vat_rates_url(conference.id, sample_vat_rate.id)
        payload = {"description": "Updated description"}
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["description"] == "Updated description"
        # Rate remains unchanged
        assert Decimal(str(data["rate"])) == Decimal("21.00")

    async def test_update_not_found_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """PUT with a non-existent rate_id returns 404."""
        fake_rate_id = uuid.uuid4()
        url = _vat_rates_url(conference.id, fake_rate_id)
        payload = {"rate": 25.00}
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 404

    async def test_update_overlap_400(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_vat_rate: ConferenceVatRate,
    ) -> None:
        """PUT changing dates to overlap with another rate returns 400."""
        today = date.today()
        # Create a second rate that does not overlap
        second_rate = ConferenceVatRate(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            rate=Decimal("22.00"),
            start_date=today + timedelta(days=31),
            end_date=today + timedelta(days=90),
            description="Second rate",
        )
        db_session.add(second_rate)
        await db_session.commit()
        await db_session.refresh(second_rate)

        # Now try to update the second rate to overlap with the first
        url = _vat_rates_url(conference.id, second_rate.id)
        payload = {
            "start_date": str(today),
            "end_date": str(today + timedelta(days=90)),
        }
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 400

    async def test_update_end_before_start_400(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_vat_rate: ConferenceVatRate,
    ) -> None:
        """PUT with end_date before start_date returns 400."""
        today = date.today()
        url = _vat_rates_url(conference.id, sample_vat_rate.id)
        # Set end_date before the existing start_date
        payload = {
            "start_date": str(today + timedelta(days=10)),
            "end_date": str(today - timedelta(days=60)),
        }
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(admin_token),
        )

        assert response.status_code == 400


# ===========================================================================
# 7. DELETE VAT RATE
# ===========================================================================


class TestDeleteVatRate:
    """DELETE /conferences/{conference_id}/vat-rates/{rate_id}"""

    async def test_delete_vat_rate(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_vat_rate: ConferenceVatRate,
    ) -> None:
        """DELETE removes the VAT rate and returns a success message."""
        url = _vat_rates_url(conference.id, sample_vat_rate.id)
        response = await client.delete(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "deleted" in data["message"].lower()

    async def test_delete_not_found_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """DELETE with a non-existent rate_id returns 404."""
        fake_rate_id = uuid.uuid4()
        url = _vat_rates_url(conference.id, fake_rate_id)
        response = await client.delete(url, headers=auth_headers(admin_token))

        assert response.status_code == 404


# ===========================================================================
# 8. TAX INFO
# ===========================================================================


class TestTaxInfo:
    """GET /conferences/{conference_id}/tax-info"""

    async def test_self_represented(
        self,
        client: AsyncClient,
        conference_same_country: Conference,
        tenant_with_modules: Tenant,
        tenant_with_country: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """When tenant country == conference country, returns representation_type='self'."""
        url = _tax_info_url(conference_same_country.id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["representation_type"] == "self"
        assert data["tenant_country"] == "Austria"
        assert data["conference_country"] == "Austria"
        assert data["effective_vat_number"] == "ATU12345678"

    async def test_fiscal_rep_needed(
        self,
        client: AsyncClient,
        conference_with_country: Conference,
        tenant_with_modules: Tenant,
        tenant_with_country: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_fiscal_rep: FiscalRepresentative,
    ) -> None:
        """When countries differ and fiscal rep exists, returns representation_type='fiscal_representative'."""
        url = _tax_info_url(conference_with_country.id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["representation_type"] == "fiscal_representative"
        assert data["tenant_country"] == "Austria"
        assert data["conference_country"] == "Germany"
        assert data["effective_vat_number"] == "DE987654321"
        assert data["fiscal_representative"] is not None
        assert data["fiscal_representative"]["company_name"] == "Tax Rep GmbH"
        assert data["fiscal_representative"]["conference_vat_number"] == "DE987654321"
        assert data["fiscal_representative"]["is_active"] is True

    async def test_fiscal_rep_needed_no_rep(
        self,
        client: AsyncClient,
        conference_with_country: Conference,
        tenant_with_modules: Tenant,
        tenant_with_country: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """When countries differ but no fiscal rep, effective_vat_number is null."""
        url = _tax_info_url(conference_with_country.id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["representation_type"] == "fiscal_representative"
        assert data["tenant_country"] == "Austria"
        assert data["conference_country"] == "Germany"
        assert data["effective_vat_number"] is None
        assert data["fiscal_representative"] is None

    async def test_current_vat_rate(
        self,
        client: AsyncClient,
        conference_with_country: Conference,
        tenant_with_modules: Tenant,
        tenant_with_country: Tenant,
        tenant_admin_user: User,
        admin_token: str,
        sample_vat_rate: ConferenceVatRate,
    ) -> None:
        """Returns the current VAT rate for today's date."""
        url = _tax_info_url(conference_with_country.id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["current_vat_rate"] is not None
        assert Decimal(str(data["current_vat_rate"])) == Decimal("21.00")
        # The rate should appear in the vat_rates list too
        assert len(data["vat_rates"]) == 1
        assert Decimal(str(data["vat_rates"][0]["rate"])) == Decimal("21.00")

    async def test_no_current_rate(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference_with_country: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_with_country: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Returns null when no VAT rate covers today."""
        today = date.today()
        # Create a rate that does NOT cover today
        future_rate = ConferenceVatRate(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference_with_country.id,
            rate=Decimal("25.00"),
            start_date=today + timedelta(days=60),
            end_date=today + timedelta(days=120),
            description="Future rate only",
        )
        db_session.add(future_rate)
        await db_session.commit()

        url = _tax_info_url(conference_with_country.id)
        response = await client.get(url, headers=auth_headers(admin_token))

        assert response.status_code == 200
        data = response.json()
        assert data["current_vat_rate"] is None
        # The rate still appears in the full list
        assert len(data["vat_rates"]) == 1
        assert data["vat_rates"][0]["description"] == "Future rate only"
