"""Tests for fiscal representative endpoints.

NOTE: ConferenceVatRate test classes (sections 4-8) are skipped because the model was
replaced with tenant-level VatRateByCountry. The conference-level /vat-rates endpoints
no longer exist. Fiscal representative CRUD tests (sections 1-3) remain active.
"""

import os
import uuid

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
from app.models.fiscal_representative import FiscalRepresentative
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

# Placeholder for deleted model used in type annotations of skipped test classes
ConferenceVatRate = type("ConferenceVatRate", (), {})

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
# 4. TAX INFO
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

    # NOTE: test_current_vat_rate and test_no_current_rate removed --
    # they used the deleted ConferenceVatRate model and the old vat_rates response field.
    # Tax-info now uses tenant-level VatRateByCountry and returns current_vat_rate only.
