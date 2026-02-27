"""Tests for theme preference feature (admin users + portal applicants)."""

import os
import uuid

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import create_applicant_access_token
from app.core.security import hash_password
from app.models.cfp import CFPApplicant
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

PORTAL_BASE = "/api/v1/portal"
AUTH_BASE = "/api/v1/auth"


# ── Portal fixtures ──────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create and return a test applicant (portal user)."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Theme",
        last_name="Tester",
        email=f"theme-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest.fixture()
def applicant_token(applicant: CFPApplicant, tenant: Tenant) -> str:
    """Return a valid applicant access token."""
    return create_applicant_access_token(applicant.id, tenant.id)


# ── Admin user theme preference tests ────────────────────────────────


class TestAdminThemePreference:
    """Tests for theme preference via PATCH /auth/me/preferences."""

    @pytest.mark.asyncio
    async def test_set_dark_theme(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ):
        """Setting theme_preference to 'dark' returns dark."""
        response = await client.patch(
            f"{AUTH_BASE}/me/preferences",
            json={"theme_preference": "dark"},
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["theme_preference"] == "dark"

    @pytest.mark.asyncio
    async def test_set_light_theme(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ):
        """Setting theme_preference to 'light' returns light."""
        response = await client.patch(
            f"{AUTH_BASE}/me/preferences",
            json={"theme_preference": "light"},
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["theme_preference"] == "light"

    @pytest.mark.asyncio
    async def test_reset_theme_to_system(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_admin_token: str,
        db_session: AsyncSession,
    ):
        """Setting theme_preference to null resets to system default."""
        # First set to dark
        tenant_admin_user.theme_preference = "dark"
        await db_session.commit()

        # Then reset to null (system)
        response = await client.patch(
            f"{AUTH_BASE}/me/preferences",
            json={"theme_preference": None},
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["theme_preference"] is None

    @pytest.mark.asyncio
    async def test_invalid_theme_resets_to_null(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ):
        """An invalid theme_preference value is treated as null."""
        response = await client.patch(
            f"{AUTH_BASE}/me/preferences",
            json={"theme_preference": "blue"},
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["theme_preference"] is None

    @pytest.mark.asyncio
    async def test_me_includes_theme_preference(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_admin_token: str,
        db_session: AsyncSession,
    ):
        """GET /auth/me includes theme_preference in response."""
        tenant_admin_user.theme_preference = "dark"
        await db_session.commit()

        response = await client.get(
            f"{AUTH_BASE}/me",
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert "theme_preference" in data
        assert data["theme_preference"] == "dark"

    @pytest.mark.asyncio
    async def test_me_default_theme_is_null(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ):
        """GET /auth/me returns null theme_preference by default."""
        response = await client.get(
            f"{AUTH_BASE}/me",
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["theme_preference"] is None

    @pytest.mark.asyncio
    async def test_theme_does_not_affect_notifications(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ):
        """Setting theme_preference leaves message_notifications_enabled unchanged."""
        response = await client.patch(
            f"{AUTH_BASE}/me/preferences",
            json={"theme_preference": "dark"},
            headers=auth_headers(tenant_admin_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["theme_preference"] == "dark"
        assert data["message_notifications_enabled"] is True  # default unchanged


# ── Portal applicant theme preference tests ──────────────────────────


class TestPortalThemePreference:
    """Tests for theme preference via PUT /portal/me."""

    @pytest.mark.asyncio
    async def test_set_dark_theme(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ):
        """Setting theme_preference to 'dark' on portal profile."""
        response = await client.put(
            f"{PORTAL_BASE}/me",
            json={"theme_preference": "dark"},
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["theme_preference"] == "dark"

    @pytest.mark.asyncio
    async def test_set_light_theme(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ):
        """Setting theme_preference to 'light' on portal profile."""
        response = await client.put(
            f"{PORTAL_BASE}/me",
            json={"theme_preference": "light"},
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["theme_preference"] == "light"

    @pytest.mark.asyncio
    async def test_invalid_theme_resets_to_null(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ):
        """An invalid theme_preference value is treated as null on portal."""
        response = await client.put(
            f"{PORTAL_BASE}/me",
            json={"theme_preference": "blue"},
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["theme_preference"] is None

    @pytest.mark.asyncio
    async def test_portal_me_includes_theme(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        db_session: AsyncSession,
    ):
        """GET /portal/me includes theme_preference in response."""
        applicant.theme_preference = "dark"
        await db_session.commit()

        response = await client.get(
            f"{PORTAL_BASE}/me",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert "theme_preference" in data
        assert data["theme_preference"] == "dark"

    @pytest.mark.asyncio
    async def test_portal_me_default_theme_is_null(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ):
        """GET /portal/me returns null theme_preference by default."""
        response = await client.get(
            f"{PORTAL_BASE}/me",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["theme_preference"] is None

    @pytest.mark.asyncio
    async def test_theme_with_other_fields(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
    ):
        """Theme preference can be set alongside other profile fields."""
        response = await client.put(
            f"{PORTAL_BASE}/me",
            json={"theme_preference": "dark", "first_name": "Updated"},
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["theme_preference"] == "dark"
        assert data["first_name"] == "Updated"
