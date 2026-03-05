"""Extended coverage tests for Registration API endpoints.

Complements test_registration.py with tests for:
- Pagination on list endpoint
- Update registration fields (name, email, booking option)
- 404 for non-existent resources
- Unauthenticated / unauthorized access
- Cross-tenant isolation
- Bookable sessions endpoint
- Add item edge cases (non-existent registration, tutorial items)
- Billing profile edge cases
- Alumni auto-creation on paid status
- Email case insensitivity
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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.alumni import Alumni
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.program import ProgramDay
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import auth_headers

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BASE = "/api/v1/conferences"


def _make_token(user: User, modules: list[str] | None = None) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


BILLING_PAYLOAD = {
    "company_name": "Coverage GmbH",
    "street": "Teststr. 42",
    "postal_code": "10115",
    "city": "Berlin",
    "country": "DE",
    "contact_first_name": "Max",
    "contact_last_name": "Mustermann",
    "contact_phone": "+491701234567",
    "contact_email": "billing@coverage.de",
    "vat_number": "DE123456789",
}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def registration_module(db_session: AsyncSession) -> Module:
    m = Module(
        id=uuid.uuid4(),
        name="Registration",
        code="registration",
        description="Conference registration",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_reg_module(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    registration_module: Module,
) -> Tenant:
    for mod in [conferences_module, registration_module]:
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
def reg_admin_token(tenant_admin_user: User) -> str:
    return _make_token(tenant_admin_user, modules=["conferences", "registration"])


@pytest_asyncio.fixture()
async def main_booking_option(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> BookingOption:
    opt = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Full Conference",
        description="Full conference pass",
        is_active=True,
    )
    db_session.add(opt)
    await db_session.commit()
    return opt


@pytest_asyncio.fixture()
async def addon_booking_option(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> BookingOption:
    opt = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tutorial Day",
        is_active=True,
    )
    db_session.add(opt)
    await db_session.commit()
    return opt


@pytest_asyncio.fixture()
async def second_booking_option(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> BookingOption:
    """A second booking option for testing booking option changes."""
    opt = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Student Pass",
        is_active=True,
    )
    db_session.add(opt)
    await db_session.commit()
    return opt


@pytest_asyncio.fixture()
async def inactive_booking_option(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> BookingOption:
    """An inactive booking option that should be rejected."""
    opt = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Deprecated Pass",
        is_active=False,
    )
    db_session.add(opt)
    await db_session.commit()
    return opt


@pytest_asyncio.fixture()
async def other_tenant(db_session: AsyncSession) -> Tenant:
    """A second tenant for cross-tenant isolation tests."""
    t = Tenant(
        id=uuid.uuid4(),
        name="Other Corp",
        slug=f"other-corp-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def other_tenant_admin(db_session: AsyncSession, other_tenant: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=other_tenant.id,
        email=f"other-admin-{uuid.uuid4().hex[:8]}@other.com",
        password_hash=hash_password("Password123!"),
        first_name="Other",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture()
async def other_tenant_with_reg(
    db_session: AsyncSession,
    other_tenant: Tenant,
    conferences_module: Module,
    registration_module: Module,
) -> Tenant:
    for mod in [conferences_module, registration_module]:
        db_session.add(
            TenantModule(
                id=uuid.uuid4(),
                tenant_id=other_tenant.id,
                module_id=mod.id,
                is_enabled=True,
            )
        )
    await db_session.commit()
    return other_tenant


# Helper to create a registration and return its id
async def _create_registration(
    client: AsyncClient,
    conference_id: uuid.UUID,
    token: str,
    booking_option_id: uuid.UUID,
    first_name: str = "Test",
    last_name: str = "User",
    email: str | None = None,
) -> dict:
    """Create a registration via the API and return the response body."""
    if email is None:
        email = f"{uuid.uuid4().hex[:8]}@test.com"
    payload = {
        "attendee": {
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
        },
        "billing": BILLING_PAYLOAD,
        "booking_option_id": str(booking_option_id),
    }
    resp = await client.post(
        f"{BASE}/{conference_id}/registrations/individual",
        json=payload,
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, f"Registration creation failed: {resp.text}"
    return resp.json()


# =========================================================================
# 1. Pagination tests
# =========================================================================


class TestListPagination:
    """Tests for pagination on GET /conferences/{id}/registrations."""

    @pytest.mark.asyncio
    async def test_pagination_defaults(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Default page=1, page_size=20, pages=1 with few registrations."""
        # Create 3 registrations
        for i in range(3):
            await _create_registration(
                client,
                conference.id,
                reg_admin_token,
                main_booking_option.id,
                first_name=f"Page{i}",
                email=f"page{i}@test.com",
            )

        resp = await client.get(
            f"{BASE}/{conference.id}/registrations",
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert data["page"] == 1
        assert data["page_size"] == 20
        assert data["pages"] == 1
        assert len(data["items"]) == 3

    @pytest.mark.asyncio
    async def test_pagination_custom_page_size(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Custom page_size=2 with 5 registrations yields 3 pages."""
        for i in range(5):
            await _create_registration(
                client,
                conference.id,
                reg_admin_token,
                main_booking_option.id,
                first_name=f"Paged{i}",
                email=f"paged{i}@test.com",
            )

        resp = await client.get(
            f"{BASE}/{conference.id}/registrations",
            params={"page_size": 2},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 5
        assert data["page_size"] == 2
        assert data["pages"] == 3
        assert len(data["items"]) == 2

    @pytest.mark.asyncio
    async def test_pagination_second_page(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Page 2 with page_size=2 returns the next set of items."""
        for i in range(5):
            await _create_registration(
                client,
                conference.id,
                reg_admin_token,
                main_booking_option.id,
                first_name=f"P2_{i}",
                email=f"p2_{i}@test.com",
            )

        resp = await client.get(
            f"{BASE}/{conference.id}/registrations",
            params={"page": 2, "page_size": 2},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 2
        assert len(data["items"]) == 2

    @pytest.mark.asyncio
    async def test_pagination_last_page_partial(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Last page returns remaining items (less than page_size)."""
        for i in range(5):
            await _create_registration(
                client,
                conference.id,
                reg_admin_token,
                main_booking_option.id,
                first_name=f"Last{i}",
                email=f"last{i}@test.com",
            )

        resp = await client.get(
            f"{BASE}/{conference.id}/registrations",
            params={"page": 3, "page_size": 2},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 3
        assert len(data["items"]) == 1

    @pytest.mark.asyncio
    async def test_pagination_beyond_last_page(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Requesting a page beyond the last page returns empty items."""
        await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="beyond@test.com",
        )

        resp = await client.get(
            f"{BASE}/{conference.id}/registrations",
            params={"page": 100, "page_size": 10},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert len(data["items"]) == 0


# =========================================================================
# 2. Update registration field tests
# =========================================================================


class TestUpdateRegistration:
    """Tests for PUT /conferences/{id}/registrations/{reg_id}."""

    @pytest.mark.asyncio
    async def test_update_first_name(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Update just the first name."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            first_name="Original",
            email="update-name@test.com",
        )
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{reg['id']}",
            json={"first_name": "Updated"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["first_name"] == "Updated"
        # Last name unchanged
        assert resp.json()["last_name"] == "User"

    @pytest.mark.asyncio
    async def test_update_email(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Update the email address of a registration."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="old-email@test.com",
        )
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{reg['id']}",
            json={"email": "new-email@test.com"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["email"] == "new-email@test.com"

    @pytest.mark.asyncio
    async def test_update_email_to_existing_fails(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Cannot update email to one already registered for this conference."""
        await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="taken@test.com",
        )
        reg2 = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="changeme@test.com",
        )
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{reg2['id']}",
            json={"email": "taken@test.com"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_update_booking_option(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
        second_booking_option: BookingOption,
    ) -> None:
        """Update the booking option of a registration."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="change-option@test.com",
        )
        assert reg["booking_option_name"] == "Full Conference"

        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{reg['id']}",
            json={"booking_option_id": str(second_booking_option.id)},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["booking_option_id"] == str(second_booking_option.id)
        assert resp.json()["booking_option_name"] == "Student Pass"

    @pytest.mark.asyncio
    async def test_update_booking_option_to_invalid_fails(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Updating booking option to a non-existent one returns 400."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="bad-option-update@test.com",
        )
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{reg['id']}",
            json={"booking_option_id": str(uuid.uuid4())},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_update_notes(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Update notes field on a registration."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="notes@test.com",
        )
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{reg['id']}",
            json={"notes": "VIP attendee"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["notes"] == "VIP attendee"

    @pytest.mark.asyncio
    async def test_update_multiple_fields(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Update multiple fields at once."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            first_name="Multi",
            last_name="User",
            email="multi-update@test.com",
        )
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{reg['id']}",
            json={
                "first_name": "NewFirst",
                "last_name": "NewLast",
                "job_title": "CTO",
                "department": "Engineering",
                "phone": "+49123456789",
                "pronouns": "she/her",
            },
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["first_name"] == "NewFirst"
        assert data["last_name"] == "NewLast"
        assert data["job_title"] == "CTO"
        assert data["department"] == "Engineering"
        assert data["phone"] == "+49123456789"
        assert data["pronouns"] == "she/her"


# =========================================================================
# 3. Not found (404) tests
# =========================================================================


class TestNotFound:
    """Tests that 404 is returned for non-existent resources."""

    @pytest.mark.asyncio
    async def test_get_nonexistent_registration(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
    ) -> None:
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations/{uuid.uuid4()}",
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_update_nonexistent_registration(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
    ) -> None:
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{uuid.uuid4()}",
            json={"first_name": "Ghost"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_nonexistent_registration(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
    ) -> None:
        resp = await client.delete(
            f"{BASE}/{conference.id}/registrations/{uuid.uuid4()}",
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_billing_nonexistent_registration(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
    ) -> None:
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations/{uuid.uuid4()}/billing",
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_update_billing_nonexistent_registration(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
    ) -> None:
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{uuid.uuid4()}/billing",
            json={"company_name": "Ghost GmbH"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_add_item_nonexistent_registration(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        addon_booking_option: BookingOption,
    ) -> None:
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/{uuid.uuid4()}/items",
            json={
                "item_type": "booking_option",
                "booking_option_id": str(addon_booking_option.id),
            },
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_remove_nonexistent_item(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="item-404@test.com",
        )
        resp = await client.delete(
            f"{BASE}/{conference.id}/registrations/{reg['id']}/items/{uuid.uuid4()}",
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 404


# =========================================================================
# 4. Authentication / authorization tests
# =========================================================================


class TestAuth:
    """Tests for unauthenticated and unauthorized access."""

    @pytest.mark.asyncio
    async def test_list_unauthenticated(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        conference: Conference,
    ) -> None:
        resp = await client.get(f"{BASE}/{conference.id}/registrations")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_unauthenticated(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        conference: Conference,
    ) -> None:
        resp = await client.get(f"{BASE}/{conference.id}/registrations/{uuid.uuid4()}")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_unauthenticated(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        conference: Conference,
    ) -> None:
        payload = {
            "billing": BILLING_PAYLOAD,
            "attendees": [
                {
                    "first_name": "No",
                    "last_name": "Auth",
                    "email": "noauth@test.com",
                    "booking_option_id": str(uuid.uuid4()),
                }
            ],
        }
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations",
            json=payload,
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_update_unauthenticated(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        conference: Conference,
    ) -> None:
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{uuid.uuid4()}",
            json={"first_name": "Hacker"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_unauthenticated(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        conference: Conference,
    ) -> None:
        resp = await client.delete(
            f"{BASE}/{conference.id}/registrations/{uuid.uuid4()}",
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_add_item_unauthenticated(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        conference: Conference,
    ) -> None:
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/{uuid.uuid4()}/items",
            json={"item_type": "booking_option", "booking_option_id": str(uuid.uuid4())},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_billing_unauthenticated(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        conference: Conference,
    ) -> None:
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations/{uuid.uuid4()}/billing",
        )
        assert resp.status_code == 401


# =========================================================================
# 5. Cross-tenant isolation tests
# =========================================================================


class TestCrossTenantIsolation:
    """Tenant A cannot access tenant B's registrations."""

    @pytest.mark.asyncio
    async def test_list_cross_tenant_returns_empty(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        other_tenant_with_reg: Tenant,
        tenant_admin_user: User,
        other_tenant_admin: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Other tenant admin cannot see registrations belonging to first tenant."""
        await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="tenant-a@test.com",
        )

        # Other tenant token
        other_token = _make_token(other_tenant_admin, modules=["conferences", "registration"])

        # Other tenant tries to list — the conference doesn't belong to them
        # so the conference check should fail
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations",
            headers=auth_headers(other_token),
        )
        # Expect 404 (conference not found for other tenant) or 403
        assert resp.status_code in (403, 404)

    @pytest.mark.asyncio
    async def test_get_cross_tenant_returns_404(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        other_tenant_with_reg: Tenant,
        tenant_admin_user: User,
        other_tenant_admin: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Other tenant admin cannot get a specific registration from another tenant."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="isolation@test.com",
        )

        other_token = _make_token(other_tenant_admin, modules=["conferences", "registration"])
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations/{reg['id']}",
            headers=auth_headers(other_token),
        )
        assert resp.status_code in (403, 404)


# =========================================================================
# 6. Bookable sessions endpoint tests
# =========================================================================


class TestBookableSessions:
    """Tests for GET /conferences/{id}/registrations/bookable-sessions/{booking_option_id}."""

    @pytest.mark.asyncio
    async def test_bookable_sessions_no_day_linked(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Booking option without a linked day returns empty groups."""
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations/bookable-sessions/{main_booking_option.id}",
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["day_name"] is None
        assert data["groups"] == []

    @pytest.mark.asyncio
    async def test_bookable_sessions_nonexistent_option(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
    ) -> None:
        """Non-existent booking option returns empty groups."""
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations/bookable-sessions/{uuid.uuid4()}",
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["day_name"] is None
        assert data["groups"] == []

    @pytest.mark.asyncio
    async def test_bookable_sessions_with_day_no_sessions(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        db_session: AsyncSession,
        tenant: Tenant,
    ) -> None:
        """Booking option linked to a day with no bookable sessions returns empty groups."""
        # Create a program day
        from datetime import date as date_type

        day = ProgramDay(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            name="Day 1",
            date=date_type(2026, 6, 1),
            sort_order=0,
        )
        db_session.add(day)
        await db_session.flush()

        # Create booking option linked to day
        opt = BookingOption(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            name="Day 1 Pass",
            conference_day_id=day.id,
            is_active=True,
        )
        db_session.add(opt)
        await db_session.commit()

        resp = await client.get(
            f"{BASE}/{conference.id}/registrations/bookable-sessions/{opt.id}",
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["day_name"] == "Day 1"
        assert data["groups"] == []

    @pytest.mark.asyncio
    async def test_bookable_sessions_unauthenticated(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        conference: Conference,
    ) -> None:
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations/bookable-sessions/{uuid.uuid4()}",
        )
        assert resp.status_code == 401


# =========================================================================
# 7. Billing profile edge cases
# =========================================================================


class TestBillingProfile:
    """Tests for billing profile get/update edge cases."""

    @pytest.mark.asyncio
    async def test_update_billing_multiple_fields(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Update multiple billing fields at once."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="billing-multi@test.com",
        )
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{reg['id']}/billing",
            json={
                "company_name": "New Corp",
                "street": "Neue Str. 1",
                "city": "Munich",
                "country": "DE",
                "vat_number": "DE999999999",
            },
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["company_name"] == "New Corp"
        assert data["street"] == "Neue Str. 1"
        assert data["city"] == "Munich"
        assert data["vat_number"] == "DE999999999"

    @pytest.mark.asyncio
    async def test_billing_vat_validated_field(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Can set vat_validated on billing profile."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="vat-val@test.com",
        )
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{reg['id']}/billing",
            json={"vat_validated": True},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["vat_validated"] is True

    @pytest.mark.asyncio
    async def test_billing_procurement_code(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Can update procurement_code on billing profile."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="procurement@test.com",
        )
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{reg['id']}/billing",
            json={"procurement_code": "PO-2026-001"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        # Verify via get
        get_resp = await client.get(
            f"{BASE}/{conference.id}/registrations/{reg['id']}/billing",
            headers=auth_headers(reg_admin_token),
        )
        assert get_resp.status_code == 200


# =========================================================================
# 8. Registration item edge cases
# =========================================================================


class TestRegistrationItems:
    """Tests for add-on item edge cases."""

    @pytest.mark.asyncio
    async def test_add_booking_option_item_without_id_fails(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Adding a booking_option item without booking_option_id returns 400."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="item-no-id@test.com",
        )
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/{reg['id']}/items",
            json={"item_type": "booking_option"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_add_tutorial_item_pending(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Adding a tutorial item when program is not published creates pending item."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="tutorial-pending@test.com",
        )
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/{reg['id']}/items",
            json={"item_type": "tutorial"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["item_type"] == "tutorial"
        assert data["pending"] is True
        assert "to be selected" in data["item_name"].lower()

    @pytest.mark.asyncio
    async def test_add_multiple_items(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
        addon_booking_option: BookingOption,
    ) -> None:
        """Adding multiple items to a registration."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="multi-items@test.com",
        )
        # Add first item
        resp1 = await client.post(
            f"{BASE}/{conference.id}/registrations/{reg['id']}/items",
            json={
                "item_type": "booking_option",
                "booking_option_id": str(addon_booking_option.id),
            },
            headers=auth_headers(reg_admin_token),
        )
        assert resp1.status_code == 201

        # Add second item (tutorial)
        resp2 = await client.post(
            f"{BASE}/{conference.id}/registrations/{reg['id']}/items",
            json={"item_type": "tutorial"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp2.status_code == 201

        # Verify both items appear
        get_resp = await client.get(
            f"{BASE}/{conference.id}/registrations/{reg['id']}",
            headers=auth_headers(reg_admin_token),
        )
        assert get_resp.status_code == 200
        assert len(get_resp.json()["items"]) == 2

    @pytest.mark.asyncio
    async def test_add_item_with_invalid_booking_option(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Adding an item referencing a non-existent booking option returns 400."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="bad-item@test.com",
        )
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/{reg['id']}/items",
            json={
                "item_type": "booking_option",
                "booking_option_id": str(uuid.uuid4()),
            },
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_add_item_with_notes(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
        addon_booking_option: BookingOption,
    ) -> None:
        """Adding an item with notes stores them."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="item-notes@test.com",
        )
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/{reg['id']}/items",
            json={
                "item_type": "booking_option",
                "booking_option_id": str(addon_booking_option.id),
                "notes": "Special dietary requirement",
            },
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 201
        assert resp.json()["notes"] == "Special dietary requirement"


# =========================================================================
# 9. Email case insensitivity
# =========================================================================


class TestEmailCaseInsensitivity:
    """Tests that email handling is case-insensitive."""

    @pytest.mark.asyncio
    async def test_email_lowercased_on_create(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Emails are lowercased when stored."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="UPPER@CASE.COM",
        )
        assert reg["email"] == "upper@case.com"

    @pytest.mark.asyncio
    async def test_duplicate_email_case_insensitive(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Duplicate check is case-insensitive."""
        await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="unique@test.com",
        )
        # Try same email with different case
        payload = {
            "attendee": {
                "first_name": "Dup",
                "last_name": "Case",
                "email": "UNIQUE@TEST.COM",
            },
            "billing": BILLING_PAYLOAD,
            "booking_option_id": str(main_booking_option.id),
        }
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/individual",
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 400


# =========================================================================
# 10. Inactive booking option rejected
# =========================================================================


class TestInactiveBookingOption:
    """Tests that inactive booking options are rejected."""

    @pytest.mark.asyncio
    async def test_create_with_inactive_option_rejected(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        inactive_booking_option: BookingOption,
    ) -> None:
        """Registration with an inactive booking option returns 400."""
        payload = {
            "attendee": {
                "first_name": "Inactive",
                "last_name": "Option",
                "email": "inactive@test.com",
            },
            "billing": BILLING_PAYLOAD,
            "booking_option_id": str(inactive_booking_option.id),
        }
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/individual",
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 400


# =========================================================================
# 11. Alumni auto-creation on paid status
# =========================================================================


class TestAlumniAutoCreation:
    """Tests that paying a registration creates an alumni record."""

    @pytest.mark.asyncio
    async def test_status_paid_creates_alumni(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
        db_session: AsyncSession,
    ) -> None:
        """Setting status to 'paid' auto-creates an Alumni record."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            first_name="Alumni",
            last_name="Creator",
            email="alumni@test.com",
        )

        # Set to paid
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{reg['id']}",
            json={"status": "paid"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "paid"

        # Check alumni was created in the DB
        result = await db_session.execute(
            select(Alumni).where(
                Alumni.conference_id == conference.id,
                Alumni.email == "alumni@test.com",
            )
        )
        alumni = result.scalar_one_or_none()
        assert alumni is not None
        assert alumni.first_name == "Alumni"
        assert alumni.last_name == "Creator"
        assert alumni.source == "registration"

    @pytest.mark.asyncio
    async def test_status_paid_idempotent(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
        db_session: AsyncSession,
    ) -> None:
        """Setting status to 'paid' twice does not create duplicate alumni."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            first_name="Idem",
            last_name="Potent",
            email="idempotent@test.com",
        )

        # Set to paid twice
        for _ in range(2):
            resp = await client.put(
                f"{BASE}/{conference.id}/registrations/{reg['id']}",
                json={"status": "paid"},
                headers=auth_headers(reg_admin_token),
            )
            assert resp.status_code == 200

        # Check only one alumni exists
        from sqlalchemy import func as sa_func

        result = await db_session.execute(
            select(sa_func.count(Alumni.id)).where(
                Alumni.conference_id == conference.id,
                Alumni.email == "idempotent@test.com",
            )
        )
        count = result.scalar()
        assert count == 1


# =========================================================================
# 12. Registration creation with extra fields
# =========================================================================


class TestRegistrationWithExtraFields:
    """Tests for registration creation with optional fields."""

    @pytest.mark.asyncio
    async def test_create_with_all_optional_fields(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Create a registration with all optional attendee fields."""
        payload = {
            "attendee": {
                "first_name": "Full",
                "last_name": "Fields",
                "email": "full@fields.com",
                "pronouns": "they/them",
                "job_title": "Software Engineer",
                "department": "Engineering",
                "phone": "+491234567890",
            },
            "billing": BILLING_PAYLOAD,
            "booking_option_id": str(main_booking_option.id),
        }
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/individual",
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["pronouns"] == "they/them"
        assert data["job_title"] == "Software Engineer"
        assert data["department"] == "Engineering"
        assert data["phone"] == "+491234567890"

    @pytest.mark.asyncio
    async def test_create_with_notes(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Create a registration with notes via the individual endpoint."""
        payload = {
            "attendee": {
                "first_name": "Notes",
                "last_name": "Person",
                "email": "notes-person@test.com",
            },
            "billing": BILLING_PAYLOAD,
            "booking_option_id": str(main_booking_option.id),
            "notes": "Requires wheelchair access",
        }
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/individual",
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 201
        assert resp.json()["notes"] == "Requires wheelchair access"

    @pytest.mark.asyncio
    async def test_create_with_items_at_registration_time(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
        addon_booking_option: BookingOption,
    ) -> None:
        """Create a registration with add-on items included in the initial request."""
        payload = {
            "attendee": {
                "first_name": "WithItems",
                "last_name": "AtCreate",
                "email": "items-at-create@test.com",
            },
            "billing": BILLING_PAYLOAD,
            "booking_option_id": str(main_booking_option.id),
            "items": [
                {
                    "item_type": "booking_option",
                    "booking_option_id": str(addon_booking_option.id),
                },
            ],
        }
        resp = await client.post(
            f"{BASE}/{conference.id}/registrations/individual",
            json=payload,
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["item_name"] == "Tutorial Day"


# =========================================================================
# 13. Delete with verification
# =========================================================================


class TestDeleteRegistration:
    """Additional delete tests."""

    @pytest.mark.asyncio
    async def test_delete_returns_message(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Delete returns a success message with the registrant's name."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            first_name="ToDelete",
            last_name="Person",
            email="to-delete@test.com",
        )
        resp = await client.delete(
            f"{BASE}/{conference.id}/registrations/{reg['id']}",
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        assert "ToDelete Person" in resp.json()["message"]

    @pytest.mark.asyncio
    async def test_delete_cascades_items(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
        addon_booking_option: BookingOption,
    ) -> None:
        """Deleting a registration with items succeeds (cascade)."""
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="cascade-delete@test.com",
        )
        # Add an item
        await client.post(
            f"{BASE}/{conference.id}/registrations/{reg['id']}/items",
            json={
                "item_type": "booking_option",
                "booking_option_id": str(addon_booking_option.id),
            },
            headers=auth_headers(reg_admin_token),
        )
        # Delete
        resp = await client.delete(
            f"{BASE}/{conference.id}/registrations/{reg['id']}",
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200

        # Verify gone
        get_resp = await client.get(
            f"{BASE}/{conference.id}/registrations/{reg['id']}",
            headers=auth_headers(reg_admin_token),
        )
        assert get_resp.status_code == 404


# =========================================================================
# 14. Status transitions
# =========================================================================


class TestStatusTransitions:
    """Tests for various status transitions."""

    @pytest.mark.asyncio
    async def test_transition_to_invoiced(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="invoiced@test.com",
        )
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{reg['id']}",
            json={"status": "invoiced"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "invoiced"

    @pytest.mark.asyncio
    async def test_transition_to_cancelled(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="cancelled@test.com",
        )
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{reg['id']}",
            json={"status": "cancelled"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"

    @pytest.mark.asyncio
    async def test_invalid_status_rejected(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        reg = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            email="bad-status@test.com",
        )
        resp = await client.put(
            f"{BASE}/{conference.id}/registrations/{reg['id']}",
            json={"status": "nonexistent_status"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 422


# =========================================================================
# 15. Search edge cases
# =========================================================================


class TestSearchEdgeCases:
    """Tests for search functionality edge cases."""

    @pytest.mark.asyncio
    async def test_search_by_last_name(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Search by last name works."""
        await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            first_name="Jane",
            last_name="Uniquelastname",
            email="jane-search@test.com",
        )
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations",
            params={"search": "Uniquelastname"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 1
        assert resp.json()["items"][0]["last_name"] == "Uniquelastname"

    @pytest.mark.asyncio
    async def test_search_case_insensitive(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Search is case-insensitive."""
        await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            first_name="CaseTest",
            email="casetest@test.com",
        )
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations",
            params={"search": "casetest"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 1

    @pytest.mark.asyncio
    async def test_search_no_results(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
    ) -> None:
        """Search with no matches returns empty."""
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations",
            params={"search": "zzz_nonexistent_zzz"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0
        assert resp.json()["items"] == []

    @pytest.mark.asyncio
    async def test_search_combined_with_status_filter(
        self,
        client: AsyncClient,
        tenant_with_reg_module: Tenant,
        tenant_admin_user: User,
        reg_admin_token: str,
        conference: Conference,
        main_booking_option: BookingOption,
    ) -> None:
        """Search combined with status filter narrows results."""
        reg1 = await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            first_name="Combo",
            email="combo1@test.com",
        )
        await _create_registration(
            client,
            conference.id,
            reg_admin_token,
            main_booking_option.id,
            first_name="Combo",
            email="combo2@test.com",
        )

        # Set one to paid
        await client.put(
            f"{BASE}/{conference.id}/registrations/{reg1['id']}",
            json={"status": "paid"},
            headers=auth_headers(reg_admin_token),
        )

        # Search for "Combo" + status=paid
        resp = await client.get(
            f"{BASE}/{conference.id}/registrations",
            params={"search": "Combo", "status": "paid"},
            headers=auth_headers(reg_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 1
        assert resp.json()["items"][0]["status"] == "paid"
