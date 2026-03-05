"""Tests for sponsor CRUD endpoints."""

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
from app.models.module import Module, TenantModule
from app.models.sponsor import Sponsor
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User, modules: list[str] | None = None) -> str:
    """Create a valid JWT access token for a user."""
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


def _sponsors_url(conference_id: uuid.UUID, path: str = "") -> str:
    """Build the sponsors endpoint URL."""
    base = f"/api/v1/conferences/{conference_id}/sponsors"
    if path:
        return f"{base}/{path}"
    return base


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def sponsors_module(db_session: AsyncSession) -> Module:
    """Create the 'sponsors' module."""
    m = Module(
        id=uuid.uuid4(),
        name="Sponsors",
        code="sponsors",
        description="Sponsor management",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_sponsors_module(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    sponsors_module: Module,
) -> Tenant:
    """Associate both conferences and sponsors modules with the test tenant."""
    for mod in (conferences_module, sponsors_module):
        db_session.add(
            TenantModule(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                module_id=mod.id,
                is_enabled=True,
            )
        )
    await db_session.commit()
    return tenant


@pytest.fixture()
def admin_token_sponsors(tenant_admin_user: User) -> str:
    """Return a valid access token for the tenant admin with sponsors module."""
    return _make_token(tenant_admin_user, modules=["sponsors"])


@pytest.fixture()
def super_admin_token_sponsors(super_admin_user: User) -> str:
    """Return a valid access token for the super admin with sponsors module."""
    return _make_token(super_admin_user, modules=["sponsors"])


@pytest.fixture()
def user_token_sponsors(regular_user: User) -> str:
    """Return a valid access token for the regular user with sponsors module."""
    return _make_token(regular_user, modules=["sponsors"])


@pytest_asyncio.fixture()
async def sample_sponsor(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> Sponsor:
    """Create a sample sponsor directly in the database."""
    sponsor = Sponsor(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        company_name="Acme Corp",
        phone="+1234567890",
        website="https://acme.example.com",
        address_line1="123 Main St",
        city="Springfield",
        state="IL",
        postal_code="62701",
        country="US",
        price=5000,
        currency="USD",
        is_active=True,
    )
    db_session.add(sponsor)
    await db_session.commit()
    await db_session.refresh(sponsor)
    return sponsor


# ═══════════════════════════════════════════════════════════════════════
# 1. LIST SPONSORS
# ═══════════════════════════════════════════════════════════════════════


class TestListSponsors:
    """GET /conferences/{conference_id}/sponsors"""

    async def test_list_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
    ) -> None:
        """Listing sponsors returns an empty list when none exist."""
        url = _sponsors_url(conference.id)
        response = await client.get(url, headers=auth_headers(admin_token_sponsors))

        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["pages"] == 0

    async def test_list_with_sponsors(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
        sample_sponsor: Sponsor,
    ) -> None:
        """Listing sponsors returns existing sponsors."""
        url = _sponsors_url(conference.id)
        response = await client.get(url, headers=auth_headers(admin_token_sponsors))

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["company_name"] == "Acme Corp"
        assert data["items"][0]["id"] == str(sample_sponsor.id)

    async def test_list_pagination(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
    ) -> None:
        """Pagination parameters page and page_size work correctly."""
        # Create 3 sponsors
        for i in range(3):
            sponsor = Sponsor(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                conference_id=conference.id,
                company_name=f"Company {chr(65 + i)}",
                is_active=True,
            )
            db_session.add(sponsor)
        await db_session.commit()

        url = _sponsors_url(conference.id)

        # Request page 1, page_size 2
        response = await client.get(
            url,
            params={"page": 1, "page_size": 2},
            headers=auth_headers(admin_token_sponsors),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        assert len(data["items"]) == 2
        assert data["page"] == 1
        assert data["page_size"] == 2
        assert data["pages"] == 2

        # Request page 2, page_size 2
        response = await client.get(
            url,
            params={"page": 2, "page_size": 2},
            headers=auth_headers(admin_token_sponsors),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        assert len(data["items"]) == 1
        assert data["page"] == 2

    async def test_list_search(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
    ) -> None:
        """Search by company_name filters results correctly."""
        # Create two sponsors with different names
        for name in ("Alpha Technologies", "Beta Solutions"):
            sponsor = Sponsor(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                conference_id=conference.id,
                company_name=name,
                is_active=True,
            )
            db_session.add(sponsor)
        await db_session.commit()

        url = _sponsors_url(conference.id)

        # Search for "Alpha"
        response = await client.get(
            url,
            params={"search": "Alpha"},
            headers=auth_headers(admin_token_sponsors),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["company_name"] == "Alpha Technologies"

    async def test_list_filter_is_active(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
    ) -> None:
        """Filtering by is_active returns only matching sponsors."""
        # Create an active and an inactive sponsor
        active_sponsor = Sponsor(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            company_name="Active Corp",
            is_active=True,
        )
        inactive_sponsor = Sponsor(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            company_name="Inactive Corp",
            is_active=False,
        )
        db_session.add_all([active_sponsor, inactive_sponsor])
        await db_session.commit()

        url = _sponsors_url(conference.id)

        # Filter active only
        response = await client.get(
            url,
            params={"is_active": True},
            headers=auth_headers(admin_token_sponsors),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["company_name"] == "Active Corp"

        # Filter inactive only
        response = await client.get(
            url,
            params={"is_active": False},
            headers=auth_headers(admin_token_sponsors),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert data["items"][0]["company_name"] == "Inactive Corp"

    async def test_list_wrong_conference_404(
        self,
        client: AsyncClient,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
    ) -> None:
        """Listing sponsors for a nonexistent conference returns 404."""
        fake_conference_id = uuid.uuid4()
        url = _sponsors_url(fake_conference_id)
        response = await client.get(url, headers=auth_headers(admin_token_sponsors))

        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 2. CREATE SPONSOR
# ═══════════════════════════════════════════════════════════════════════


class TestCreateSponsor:
    """POST /conferences/{conference_id}/sponsors"""

    async def test_create_minimal(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
    ) -> None:
        """Create a sponsor with just company_name returns 201 with correct fields."""
        url = _sponsors_url(conference.id)
        payload = {"company_name": "Minimal Sponsor Inc"}
        response = await client.post(
            url,
            json=payload,
            headers=auth_headers(admin_token_sponsors),
        )

        assert response.status_code == 201
        data = response.json()
        assert data["company_name"] == "Minimal Sponsor Inc"
        assert data["conference_id"] == str(conference.id)
        assert data["tenant_id"] == str(tenant_with_sponsors_module.id)
        assert data["is_active"] is True
        assert data["phone"] is None
        assert data["website"] is None
        assert data["price"] is None
        assert data["currency"] is None
        assert data["contact_persons"] == []
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    async def test_create_full_fields(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
    ) -> None:
        """Create a sponsor with all fields populated."""
        url = _sponsors_url(conference.id)
        payload = {
            "company_name": "Full Sponsor LLC",
            "phone": "+12025551234",
            "website": "https://fullsponsor.example.com",
            "address_line1": "456 Oak Ave",
            "address_line2": "Suite 200",
            "city": "Portland",
            "state": "OR",
            "postal_code": "97201",
            "country": "US",
            "price": 10000,
            "currency": "USD",
            "comments": "Premium sponsor for the conference",
            "contact_persons": [
                {
                    "first_name": "John",
                    "last_name": "Doe",
                    "email": "john@fullsponsor.example.com",
                    "phone": "+442071234567",
                }
            ],
            "is_active": True,
        }
        response = await client.post(
            url,
            json=payload,
            headers=auth_headers(admin_token_sponsors),
        )

        assert response.status_code == 201
        data = response.json()
        assert data["company_name"] == "Full Sponsor LLC"
        assert data["phone"] == "+12025551234"
        assert data["website"] == "https://fullsponsor.example.com"
        assert data["address_line1"] == "456 Oak Ave"
        assert data["address_line2"] == "Suite 200"
        assert data["city"] == "Portland"
        assert data["state"] == "OR"
        assert data["postal_code"] == "97201"
        assert data["country"] == "US"
        assert data["price"] == "10000.00"
        assert data["currency"] == "USD"
        assert data["comments"] == "Premium sponsor for the conference"
        assert len(data["contact_persons"]) == 1
        assert data["contact_persons"][0]["first_name"] == "John"
        assert data["contact_persons"][0]["last_name"] == "Doe"
        assert data["is_active"] is True

    async def test_create_no_auth_401(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
    ) -> None:
        """Creating a sponsor without an auth token returns 401."""
        url = _sponsors_url(conference.id)
        payload = {"company_name": "No Auth Corp"}
        response = await client.post(url, json=payload)

        assert response.status_code == 401

    async def test_create_regular_user_403(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
        regular_user: User,
        user_token_sponsors: str,
    ) -> None:
        """Regular user (non-admin) cannot create a sponsor and gets 403."""
        url = _sponsors_url(conference.id)
        payload = {"company_name": "Forbidden Corp"}
        response = await client.post(
            url,
            json=payload,
            headers=auth_headers(user_token_sponsors),
        )

        assert response.status_code == 403

    async def test_create_missing_company_name_422(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
    ) -> None:
        """Missing required company_name field returns 422."""
        url = _sponsors_url(conference.id)
        payload = {"website": "https://no-name.example.com"}
        response = await client.post(
            url,
            json=payload,
            headers=auth_headers(admin_token_sponsors),
        )

        assert response.status_code == 422


# ═══════════════════════════════════════════════════════════════════════
# 3. GET SPONSOR
# ═══════════════════════════════════════════════════════════════════════


class TestGetSponsor:
    """GET /conferences/{conference_id}/sponsors/{sponsor_id}"""

    async def test_get_existing(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
        sample_sponsor: Sponsor,
    ) -> None:
        """Get an existing sponsor by ID returns all fields."""
        url = _sponsors_url(conference.id, str(sample_sponsor.id))
        response = await client.get(url, headers=auth_headers(admin_token_sponsors))

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(sample_sponsor.id)
        assert data["company_name"] == "Acme Corp"
        assert data["phone"] == "+1234567890"
        assert data["website"] == "https://acme.example.com"
        assert data["address_line1"] == "123 Main St"
        assert data["city"] == "Springfield"
        assert data["state"] == "IL"
        assert data["postal_code"] == "62701"
        assert data["country"] == "US"
        assert data["price"] == "5000.00"
        assert data["currency"] == "USD"
        assert data["is_active"] is True
        assert data["conference_id"] == str(conference.id)
        assert data["tenant_id"] == str(conference.tenant_id)
        assert "created_at" in data
        assert "updated_at" in data

    async def test_get_nonexistent_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
    ) -> None:
        """Getting a non-existent sponsor returns 404."""
        fake_sponsor_id = uuid.uuid4()
        url = _sponsors_url(conference.id, str(fake_sponsor_id))
        response = await client.get(url, headers=auth_headers(admin_token_sponsors))

        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 4. UPDATE SPONSOR
# ═══════════════════════════════════════════════════════════════════════


class TestUpdateSponsor:
    """PUT /conferences/{conference_id}/sponsors/{sponsor_id}"""

    async def test_update_company_name(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
        sample_sponsor: Sponsor,
    ) -> None:
        """Update just the company_name field."""
        url = _sponsors_url(conference.id, str(sample_sponsor.id))
        payload = {"company_name": "Acme Corp Renamed"}
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(admin_token_sponsors),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["company_name"] == "Acme Corp Renamed"
        assert data["id"] == str(sample_sponsor.id)
        # Other fields should remain unchanged
        assert data["phone"] == "+1234567890"
        assert data["website"] == "https://acme.example.com"

    async def test_update_multiple_fields(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
        sample_sponsor: Sponsor,
    ) -> None:
        """Update several fields at once."""
        url = _sponsors_url(conference.id, str(sample_sponsor.id))
        payload = {
            "phone": "+491701234567",
            "website": "https://new-site.example.com",
            "city": "Chicago",
            "price": 7500,
            "currency": "EUR",
            "is_active": False,
        }
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(admin_token_sponsors),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["phone"] == "+491701234567"
        assert data["website"] == "https://new-site.example.com"
        assert data["city"] == "Chicago"
        assert data["price"] == "7500.00"
        assert data["currency"] == "EUR"
        assert data["is_active"] is False
        # company_name unchanged
        assert data["company_name"] == "Acme Corp"

    async def test_update_nonexistent_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
    ) -> None:
        """Updating a non-existent sponsor returns 404."""
        fake_sponsor_id = uuid.uuid4()
        url = _sponsors_url(conference.id, str(fake_sponsor_id))
        payload = {"company_name": "Ghost Corp"}
        response = await client.put(
            url,
            json=payload,
            headers=auth_headers(admin_token_sponsors),
        )

        assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 5. DELETE SPONSOR
# ═══════════════════════════════════════════════════════════════════════


class TestDeleteSponsor:
    """DELETE /conferences/{conference_id}/sponsors/{sponsor_id}"""

    async def test_delete_existing(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
        sample_sponsor: Sponsor,
    ) -> None:
        """Deleting an existing sponsor returns a success message."""
        url = _sponsors_url(conference.id, str(sample_sponsor.id))
        response = await client.delete(url, headers=auth_headers(admin_token_sponsors))

        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "deleted" in data["message"].lower()

    async def test_delete_nonexistent_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
    ) -> None:
        """Deleting a non-existent sponsor returns 404."""
        fake_sponsor_id = uuid.uuid4()
        url = _sponsors_url(conference.id, str(fake_sponsor_id))
        response = await client.delete(url, headers=auth_headers(admin_token_sponsors))

        assert response.status_code == 404

    async def test_delete_verify_gone(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_sponsors_module: Tenant,
        tenant_admin_user: User,
        admin_token_sponsors: str,
        sample_sponsor: Sponsor,
    ) -> None:
        """After deleting a sponsor, GET for that sponsor returns 404."""
        url = _sponsors_url(conference.id, str(sample_sponsor.id))

        # Delete
        delete_response = await client.delete(
            url,
            headers=auth_headers(admin_token_sponsors),
        )
        assert delete_response.status_code == 200

        # Verify GET returns 404
        get_response = await client.get(
            url,
            headers=auth_headers(admin_token_sponsors),
        )
        assert get_response.status_code == 404
