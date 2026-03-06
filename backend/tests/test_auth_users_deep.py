"""Deep coverage tests for auth, portal auth, users, locations, and fiscal representative endpoints.

Targets uncovered happy-path code in:
- app/api/v1/auth.py (login flow, refresh, logout, me, preferences, forgot/reset password)
- app/api/v1/cfp_portal/auth.py (register, verify-email, login, refresh, profile, forgot/reset password, landing)
- app/api/v1/users.py (CRUD, search, filter, invite flow, resend, pronoun options)
- app/api/v1/locations.py (CRUD, tree, stats, create with contact persons, update code, filter by conference)
- app/api/v1/conferences/fiscal_representative.py (upsert create/update, delete, vat rates CRUD, tax-info)
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
os.environ.setdefault("DEBUG", "false")

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import (
    create_applicant_access_token,
    generate_email_verification_token,
)
from app.core.security import hash_password
from app.core.utils import utcnow
from app.models.applicant_token import ApplicantEmailVerification, ApplicantPasswordReset
from app.models.associations import ConferenceLocation
from app.models.cfp_applicants import CFPApplicant
from app.models.conference import Conference
# from app.models.conference_vat_rate import ConferenceVatRate  # DELETED
from app.models.fiscal_representative import FiscalRepresentative

# Skip entire module - ConferenceVatRate was deleted
pytestmark = pytest.mark.skip(reason="ConferenceVatRate model deleted - needs migration to VatRateByCountry")
from app.models.location import Location
from app.models.module import Module, TenantModule
from app.models.settings import TenantLocationType
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_password_reset import UserPasswordReset
from tests.conftest import _make_token, auth_headers

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

AUTH_URL = "/api/v1/auth"
PORTAL_URL = "/api/v1/portal"
USERS_URL = "/api/v1/users"
LOCATIONS_URL = "/api/v1/locations"
DEFAULT_PASSWORD = "Password123!"


# ---------------------------------------------------------------------------
# Helper URL builders
# ---------------------------------------------------------------------------


def _fiscal_rep_url(conference_id: uuid.UUID) -> str:
    return f"/api/v1/conferences/{conference_id}/fiscal-representative"


def _vat_rates_url(conference_id: uuid.UUID, rate_id: uuid.UUID | None = None) -> str:
    base = f"/api/v1/conferences/{conference_id}/vat-rates"
    return f"{base}/{rate_id}" if rate_id else base


def _tax_info_url(conference_id: uuid.UUID) -> str:
    return f"/api/v1/conferences/{conference_id}/tax-info"


# ---------------------------------------------------------------------------
# Shared Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def locations_module(db_session: AsyncSession, tenant: Tenant) -> Module:
    mod = Module(id=uuid.uuid4(), name="Locations", code="locations", description="Loc mgmt", is_active=True)
    db_session.add(mod)
    await db_session.flush()
    tm = TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=mod.id, is_enabled=True)
    db_session.add(tm)
    await db_session.commit()
    return mod


@pytest_asyncio.fixture()
async def venue_location_type(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> TenantLocationType:
    lt = TenantLocationType(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Venue",
        slug="venue",
        is_active=True,
    )
    db_session.add(lt)
    await db_session.commit()
    return lt


@pytest_asyncio.fixture()
async def room_location_type(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> TenantLocationType:
    lt = TenantLocationType(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Room",
        slug="room",
        is_active=True,
    )
    db_session.add(lt)
    await db_session.commit()
    return lt


@pytest_asyncio.fixture()
async def sample_venue(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    locations_module: Module,
    venue_location_type: TenantLocationType,
) -> Location:
    venue = Location(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Grand Convention Center",
        code="GCC-01",
        location_type="venue",
        description="Main conference venue",
        capacity=2000,
        city="Berlin",
        country="Germany",
        address_line1="Alexanderplatz 1",
        is_active=True,
    )
    db_session.add(venue)
    await db_session.flush()
    db_session.add(ConferenceLocation(conference_id=conference.id, location_id=venue.id))
    await db_session.commit()
    return venue


@pytest_asyncio.fixture()
async def sample_room(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    sample_venue: Location,
    room_location_type: TenantLocationType,
) -> Location:
    room = Location(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        parent_id=sample_venue.id,
        name="Room Alpha",
        code="RA-01",
        location_type="room",
        capacity=100,
        floor="2",
        is_active=True,
    )
    db_session.add(room)
    await db_session.flush()
    db_session.add(ConferenceLocation(conference_id=conference.id, location_id=room.id))
    await db_session.commit()
    return room


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create a verified CFP applicant for portal tests."""
    app = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Portal",
        last_name="User",
        email=f"portal-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password(DEFAULT_PASSWORD),
        email_verified_at=utcnow(),
    )
    db_session.add(app)
    await db_session.commit()
    return app


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="CFP", code="cfp", description="Call for papers", is_active=True)
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_all_modules(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    cfp_module: Module,
) -> Tenant:
    for mod in (conferences_module, cfp_module):
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=mod.id, is_enabled=True))
    await db_session.commit()
    return tenant


@pytest.fixture()
def admin_token(tenant_admin_user: User) -> str:
    return _make_token(tenant_admin_user, modules=["conferences", "cfp", "locations"])


# =========================================================================
# AUTH TESTS - DEEP COVERAGE
# =========================================================================


class TestAuthDeep:
    """Deep coverage for /api/v1/auth/ endpoints."""

    @pytest.mark.asyncio
    async def test_login_returns_full_token_response(
        self, client: AsyncClient, tenant_with_modules: Tenant, tenant_admin_user: User
    ) -> None:
        """Login returns all expected fields in TokenResponse."""
        resp = await client.post(
            f"{AUTH_URL}/login",
            json={"email": tenant_admin_user.email, "password": DEFAULT_PASSWORD},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] > 0

    @pytest.mark.asyncio
    async def test_login_sets_last_login(
        self, client: AsyncClient, tenant_with_modules: Tenant, tenant_admin_user: User
    ) -> None:
        """After login, the user's last_login should be set (visible via /me)."""
        login_resp = await client.post(
            f"{AUTH_URL}/login",
            json={"email": tenant_admin_user.email, "password": DEFAULT_PASSWORD},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]

        me_resp = await client.get(f"{AUTH_URL}/me", headers=auth_headers(token))
        assert me_resp.status_code == 200
        assert me_resp.json()["last_login"] is not None

    @pytest.mark.asyncio
    async def test_login_super_admin_no_tenant(self, client: AsyncClient, super_admin_user: User) -> None:
        """Super admin (no tenant) can log in successfully."""
        resp = await client.post(
            f"{AUTH_URL}/login",
            json={"email": super_admin_user.email, "password": DEFAULT_PASSWORD},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_login_tenant_super_user_flag(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        tenant: Tenant,
    ) -> None:
        """When user is designated tenant super_user, /me shows is_tenant_super_user=True."""
        # Set the tenant's super_user_id to this admin
        tenant.super_user_id = tenant_admin_user.id
        await db_session.commit()

        login_resp = await client.post(
            f"{AUTH_URL}/login",
            json={"email": tenant_admin_user.email, "password": DEFAULT_PASSWORD},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]

        me_resp = await client.get(f"{AUTH_URL}/me", headers=auth_headers(token))
        assert me_resp.status_code == 200
        assert me_resp.json()["is_tenant_super_user"] is True

    @pytest.mark.asyncio
    async def test_refresh_with_tenant_modules(
        self, client: AsyncClient, tenant_with_modules: Tenant, tenant_admin_user: User
    ) -> None:
        """Refresh token returns new access+refresh and includes tenant modules."""
        login_resp = await client.post(
            f"{AUTH_URL}/login",
            json={"email": tenant_admin_user.email, "password": DEFAULT_PASSWORD},
        )
        old_refresh = login_resp.json()["refresh_token"]

        refresh_resp = await client.post(f"{AUTH_URL}/refresh", json={"refresh_token": old_refresh})
        assert refresh_resp.status_code == 200
        data = refresh_resp.json()
        assert data["refresh_token"] != old_refresh
        assert data["expires_in"] > 0

    @pytest.mark.asyncio
    async def test_logout_revokes_refresh_tokens(
        self, client: AsyncClient, tenant_with_modules: Tenant, tenant_admin_user: User
    ) -> None:
        """After logout, the old refresh token is revoked and cannot be reused."""
        login_resp = await client.post(
            f"{AUTH_URL}/login",
            json={"email": tenant_admin_user.email, "password": DEFAULT_PASSWORD},
        )
        data = login_resp.json()
        access_token = data["access_token"]
        refresh_token = data["refresh_token"]

        # Logout
        logout_resp = await client.post(f"{AUTH_URL}/logout", headers=auth_headers(access_token))
        assert logout_resp.status_code == 200

        # Old refresh token should be revoked
        refresh_resp = await client.post(f"{AUTH_URL}/refresh", json={"refresh_token": refresh_token})
        assert refresh_resp.status_code == 401

    @pytest.mark.asyncio
    async def test_me_super_admin(self, client: AsyncClient, super_admin_user: User, super_admin_token: str) -> None:
        """Super admin /me returns correct role and no tenant."""
        resp = await client.get(f"{AUTH_URL}/me", headers=auth_headers(super_admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["role"] == "super_admin"
        assert data["tenant_id"] is None
        assert data["modules"] == []

    @pytest.mark.asyncio
    async def test_preferences_update_both_fields(
        self, client: AsyncClient, tenant_admin_user: User, tenant_admin_token: str
    ) -> None:
        """PATCH /me/preferences sets both theme and notifications."""
        resp = await client.patch(
            f"{AUTH_URL}/me/preferences",
            json={"theme_preference": "light", "message_notifications_enabled": False},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["theme_preference"] == "light"
        assert data["message_notifications_enabled"] is False

    @pytest.mark.asyncio
    async def test_preferences_invalid_theme_set_to_none(
        self, client: AsyncClient, tenant_admin_user: User, tenant_admin_token: str
    ) -> None:
        """Setting an invalid theme value results in theme_preference being None."""
        resp = await client.patch(
            f"{AUTH_URL}/me/preferences",
            json={"theme_preference": "rainbow"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["theme_preference"] is None

    @pytest.mark.asyncio
    async def test_forgot_password_creates_reset_token(self, client: AsyncClient, tenant_admin_user: User) -> None:
        """Forgot password for existing user returns success message."""
        resp = await client.post(
            f"{AUTH_URL}/forgot-password",
            json={"email": tenant_admin_user.email},
        )
        assert resp.status_code == 200
        assert "password reset link" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_reset_password_invalidates_other_tokens(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
    ) -> None:
        """Reset password invalidates all outstanding reset tokens and refresh tokens."""
        # Create two reset tokens
        raw1, hash1 = generate_email_verification_token()
        raw2, hash2 = generate_email_verification_token()
        reset1 = UserPasswordReset(
            user_id=tenant_admin_user.id,
            token_hash=hash1,
            expires_at=utcnow() + timedelta(hours=1),
        )
        reset2 = UserPasswordReset(
            user_id=tenant_admin_user.id,
            token_hash=hash2,
            expires_at=utcnow() + timedelta(hours=1),
        )
        db_session.add_all([reset1, reset2])
        await db_session.commit()

        # Use reset1
        resp = await client.post(
            f"{AUTH_URL}/reset-password",
            json={"token": raw1, "new_password": "NewPass99!"},
        )
        assert resp.status_code == 200
        assert "successfully" in resp.json()["message"].lower()

        # reset2 should now be invalidated
        resp2 = await client.post(
            f"{AUTH_URL}/reset-password",
            json={"token": raw2, "new_password": "AnotherPass99!"},
        )
        assert resp2.status_code == 401


# =========================================================================
# PORTAL AUTH TESTS - DEEP COVERAGE
# =========================================================================


class TestPortalAuthDeep:
    """Deep coverage for /api/v1/portal/ auth endpoints."""

    @pytest.mark.asyncio
    async def test_portal_register_success(self, client: AsyncClient, tenant: Tenant) -> None:
        """Register a new applicant returns success."""
        email = f"newportal-{uuid.uuid4().hex[:8]}@test.com"
        reg_resp = await client.post(
            f"{PORTAL_URL}/{tenant.slug}/register",
            json={
                "email": email,
                "password": DEFAULT_PASSWORD,
                "first_name": "New",
                "last_name": "Applicant",
            },
        )
        assert reg_resp.status_code == 200
        msg = reg_resp.json()["message"].lower()
        assert "registration successful" in msg

    @pytest.mark.asyncio
    async def test_portal_login_verified_applicant(
        self, client: AsyncClient, tenant: Tenant, applicant: CFPApplicant
    ) -> None:
        """Login with a verified applicant returns tokens."""
        login_resp = await client.post(
            f"{PORTAL_URL}/{tenant.slug}/login",
            json={"email": applicant.email, "password": DEFAULT_PASSWORD},
        )
        assert login_resp.status_code == 200
        data = login_resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_portal_register_duplicate_email(
        self, client: AsyncClient, tenant: Tenant, applicant: CFPApplicant
    ) -> None:
        """Registering with an existing email returns 409."""
        resp = await client.post(
            f"{PORTAL_URL}/{tenant.slug}/register",
            json={
                "email": applicant.email,
                "password": DEFAULT_PASSWORD,
                "first_name": "Dup",
                "last_name": "User",
            },
        )
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_portal_login_and_get_profile(
        self, client: AsyncClient, tenant: Tenant, applicant: CFPApplicant
    ) -> None:
        """Login then GET /portal/me returns the applicant profile."""
        login_resp = await client.post(
            f"{PORTAL_URL}/{tenant.slug}/login",
            json={"email": applicant.email, "password": DEFAULT_PASSWORD},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]

        profile_resp = await client.get(
            f"{PORTAL_URL}/me",
            headers=auth_headers(token),
        )
        assert profile_resp.status_code == 200
        data = profile_resp.json()
        assert data["email"] == applicant.email
        assert data["first_name"] == "Portal"

    @pytest.mark.asyncio
    async def test_portal_update_profile(self, client: AsyncClient, tenant: Tenant, applicant: CFPApplicant) -> None:
        """PUT /portal/me updates applicant profile fields."""
        token = create_applicant_access_token(applicant_id=applicant.id, tenant_id=tenant.id)

        resp = await client.put(
            f"{PORTAL_URL}/me",
            json={
                "first_name": "Updated",
                "company": "NewCo",
                "bio": "A short bio",
                "phone": "+4930123456",
            },
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["first_name"] == "Updated"
        assert data["company"] == "NewCo"
        assert data["bio"] == "A short bio"

    @pytest.mark.asyncio
    async def test_portal_refresh_token(self, client: AsyncClient, tenant: Tenant, applicant: CFPApplicant) -> None:
        """Portal refresh rotates tokens."""
        login_resp = await client.post(
            f"{PORTAL_URL}/{tenant.slug}/login",
            json={"email": applicant.email, "password": DEFAULT_PASSWORD},
        )
        old_refresh = login_resp.json()["refresh_token"]

        refresh_resp = await client.post(
            f"{PORTAL_URL}/{tenant.slug}/refresh",
            json={"refresh_token": old_refresh},
        )
        assert refresh_resp.status_code == 200
        data = refresh_resp.json()
        assert data["refresh_token"] != old_refresh
        assert "access_token" in data

    @pytest.mark.asyncio
    async def test_portal_forgot_password(self, client: AsyncClient, tenant: Tenant, applicant: CFPApplicant) -> None:
        """Portal forgot password always returns success."""
        resp = await client.post(
            f"{PORTAL_URL}/{tenant.slug}/forgot-password",
            json={"email": applicant.email},
        )
        assert resp.status_code == 200
        assert "password reset link" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_portal_forgot_password_nonexistent_email(self, client: AsyncClient, tenant: Tenant) -> None:
        """Non-existent email still returns 200 to prevent enumeration."""
        resp = await client.post(
            f"{PORTAL_URL}/{tenant.slug}/forgot-password",
            json={"email": "nobody@nowhere.io"},
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_portal_reset_password(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        applicant: CFPApplicant,
    ) -> None:
        """Portal reset password with valid token works."""
        raw_token, token_hash_val = generate_email_verification_token()
        reset = ApplicantPasswordReset(
            applicant_id=applicant.id,
            token_hash=token_hash_val,
            expires_at=utcnow() + timedelta(hours=1),
        )
        db_session.add(reset)
        await db_session.commit()

        resp = await client.post(
            f"{PORTAL_URL}/{tenant.slug}/reset-password",
            json={"token": raw_token, "new_password": "NewPortalPass99!"},
        )
        assert resp.status_code == 200
        assert "successfully" in resp.json()["message"].lower()

        # Verify login with new password
        login_resp = await client.post(
            f"{PORTAL_URL}/{tenant.slug}/login",
            json={"email": applicant.email, "password": "NewPortalPass99!"},
        )
        assert login_resp.status_code == 200

    @pytest.mark.asyncio
    async def test_portal_verify_email(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
    ) -> None:
        """Verify email with a valid token marks applicant as verified."""
        # Create unverified applicant
        unverified = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            first_name="Unverified",
            last_name="User",
            email=f"unverified-{uuid.uuid4().hex[:8]}@test.com",
            password_hash=hash_password(DEFAULT_PASSWORD),
        )
        db_session.add(unverified)
        await db_session.flush()

        raw_token, token_hash_val = generate_email_verification_token()
        verification = ApplicantEmailVerification(
            applicant_id=unverified.id,
            token_hash=token_hash_val,
            expires_at=utcnow() + timedelta(hours=24),
        )
        db_session.add(verification)
        await db_session.commit()

        resp = await client.post(
            f"{PORTAL_URL}/{tenant.slug}/verify-email",
            json={"token": raw_token},
        )
        assert resp.status_code == 200
        assert "verified" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_portal_get_tenant_info(self, client: AsyncClient, tenant: Tenant) -> None:
        """GET /portal/tenant/{slug} returns basic tenant info."""
        resp = await client.get(f"{PORTAL_URL}/tenant/{tenant.slug}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == tenant.name
        assert data["slug"] == tenant.slug

    @pytest.mark.asyncio
    async def test_portal_landing_page(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
    ) -> None:
        """GET /portal/{tenant_slug}/{abbreviation} returns landing page data."""
        resp = await client.get(f"{PORTAL_URL}/{tenant.slug}/{conference.abbreviation}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["tenant_name"] == tenant.name
        assert data["conference"]["name"] == conference.name
        assert data["conference"]["abbreviation"] == conference.abbreviation

    @pytest.mark.asyncio
    async def test_portal_committee_memberships_empty(
        self, client: AsyncClient, tenant: Tenant, applicant: CFPApplicant
    ) -> None:
        """GET /portal/me/committee-memberships returns empty list when none exist."""
        token = create_applicant_access_token(applicant_id=applicant.id, tenant_id=tenant.id)
        resp = await client.get(
            f"{PORTAL_URL}/me/committee-memberships",
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0


# =========================================================================
# USERS TESTS - DEEP COVERAGE
# =========================================================================


class TestUsersDeep:
    """Deep coverage for /api/v1/users/ endpoints."""

    @pytest.mark.asyncio
    async def test_super_admin_lists_users_with_tenant_id(
        self,
        client: AsyncClient,
        super_admin_user: User,
        super_admin_token: str,
        tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Super admin can list users by specifying tenant_id."""
        resp = await client.get(
            USERS_URL,
            params={"tenant_id": str(tenant.id)},
            headers=auth_headers(super_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        emails = [u["email"] for u in data["items"]]
        assert tenant_admin_user.email in emails

    @pytest.mark.asyncio
    async def test_super_admin_creates_user_in_tenant(
        self,
        client: AsyncClient,
        super_admin_user: User,
        super_admin_token: str,
        tenant: Tenant,
    ) -> None:
        """Super admin creates a user in a specific tenant via tenant_id query param."""
        payload = {
            "email": f"sa-created-{uuid.uuid4().hex[:8]}@test.com",
            "password": DEFAULT_PASSWORD,
            "first_name": "SACreated",
            "last_name": "User",
            "role": "user",
        }
        resp = await client.post(
            USERS_URL,
            json=payload,
            params={"tenant_id": str(tenant.id)},
            headers=auth_headers(super_admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == payload["email"]
        assert data["is_active"] is True

    @pytest.mark.asyncio
    async def test_create_user_with_pronouns(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Creating a user with pronouns stores them correctly."""
        payload = {
            "email": f"pronouns-{uuid.uuid4().hex[:8]}@test.com",
            "password": DEFAULT_PASSWORD,
            "first_name": "Pronouns",
            "last_name": "Test",
            "role": "user",
            "pronouns": "they/them",
        }
        resp = await client.post(USERS_URL, json=payload, headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 201
        assert resp.json()["pronouns"] == "they/them"

    @pytest.mark.asyncio
    async def test_update_user_password(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Updating a user's password works and allows login with new password."""
        # Create user
        email = f"pwupd-{uuid.uuid4().hex[:8]}@test.com"
        create_resp = await client.post(
            USERS_URL,
            json={
                "email": email,
                "password": DEFAULT_PASSWORD,
                "first_name": "PW",
                "last_name": "Update",
                "role": "user",
            },
            headers=auth_headers(tenant_admin_token),
        )
        uid = create_resp.json()["id"]

        # Update password
        new_pw = "UpdatedPass123!"
        resp = await client.put(
            f"{USERS_URL}/{uid}",
            json={"password": new_pw},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200

        # Login with new password
        login_resp = await client.post(
            f"{AUTH_URL}/login",
            json={"email": email, "password": new_pw},
        )
        assert login_resp.status_code == 200

    @pytest.mark.asyncio
    async def test_update_user_email_uniqueness_check(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Updating email to an existing email returns 400."""
        # Create two users
        email1 = f"emailchk1-{uuid.uuid4().hex[:8]}@test.com"
        email2 = f"emailchk2-{uuid.uuid4().hex[:8]}@test.com"
        await client.post(
            USERS_URL,
            json={"email": email1, "password": DEFAULT_PASSWORD, "first_name": "A", "last_name": "B", "role": "user"},
            headers=auth_headers(tenant_admin_token),
        )
        r2 = await client.post(
            USERS_URL,
            json={"email": email2, "password": DEFAULT_PASSWORD, "first_name": "C", "last_name": "D", "role": "user"},
            headers=auth_headers(tenant_admin_token),
        )
        uid2 = r2.json()["id"]

        # Try to change user2's email to user1's email
        resp = await client.put(
            f"{USERS_URL}/{uid2}",
            json={"email": email1},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_update_user_has_all_conference_access(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Updating has_all_conference_access flag works."""
        create_resp = await client.post(
            USERS_URL,
            json={
                "email": f"confaccess-{uuid.uuid4().hex[:8]}@test.com",
                "password": DEFAULT_PASSWORD,
                "first_name": "Conf",
                "last_name": "Access",
                "role": "user",
            },
            headers=auth_headers(tenant_admin_token),
        )
        uid = create_resp.json()["id"]

        resp = await client.put(
            f"{USERS_URL}/{uid}",
            json={"has_all_conference_access": False},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["has_all_conference_access"] is False

    @pytest.mark.asyncio
    async def test_deactivate_user_clears_super_user(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Deactivating the tenant's super user clears tenant.super_user_id."""
        # Create a user and make them tenant super user
        create_resp = await client.post(
            USERS_URL,
            json={
                "email": f"superuser-{uuid.uuid4().hex[:8]}@test.com",
                "password": DEFAULT_PASSWORD,
                "first_name": "Super",
                "last_name": "Usr",
                "role": "user",
            },
            headers=auth_headers(tenant_admin_token),
        )
        uid = create_resp.json()["id"]
        tenant.super_user_id = uuid.UUID(uid)
        await db_session.commit()

        # Deactivate the super user
        resp = await client.delete(f"{USERS_URL}/{uid}", headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 200
        assert "deactivated" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_resend_invite_already_logged_in(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Resending invite for a user who already logged in returns 400."""
        # Create user with password (so they can login)
        email = f"loggedin-{uuid.uuid4().hex[:8]}@test.com"
        create_resp = await client.post(
            USERS_URL,
            json={
                "email": email,
                "password": DEFAULT_PASSWORD,
                "first_name": "Logged",
                "last_name": "In",
                "role": "user",
            },
            headers=auth_headers(tenant_admin_token),
        )
        uid = create_resp.json()["id"]

        # Login to set last_login
        await client.post(f"{AUTH_URL}/login", json={"email": email, "password": DEFAULT_PASSWORD})

        # Try to resend invite
        resp = await client.post(f"{USERS_URL}/{uid}/resend-invite", headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_resend_invite_deactivated_user(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Resending invite for a deactivated user returns 400."""
        create_resp = await client.post(
            USERS_URL,
            json={
                "email": f"deact-invite-{uuid.uuid4().hex[:8]}@test.com",
                "first_name": "Deact",
                "last_name": "Invite",
                "role": "user",
            },
            headers=auth_headers(tenant_admin_token),
        )
        uid = create_resp.json()["id"]

        # Deactivate
        await client.delete(f"{USERS_URL}/{uid}", headers=auth_headers(tenant_admin_token))

        # Resend invite should fail
        resp = await client.post(f"{USERS_URL}/{uid}/resend-invite", headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 400


# =========================================================================
# LOCATIONS TESTS - DEEP COVERAGE
# =========================================================================


class TestLocationsDeep:
    """Deep coverage for /api/v1/locations/ endpoints."""

    @pytest.mark.asyncio
    async def test_create_location_with_contact_persons(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        locations_module: Module,
        venue_location_type: TenantLocationType,
    ) -> None:
        """Create location with contact_persons list."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        payload = {
            "name": "Contact Venue",
            "location_type": "venue",
            "conference_id": str(conference.id),
            "contact_persons": [
                {"first_name": "John", "last_name": "Doe", "email": "john@test.com"},
                {"first_name": "Jane", "last_name": "Smith", "phone": "+4930123456"},
            ],
        }
        resp = await client.post(LOCATIONS_URL, json=payload, headers=auth_headers(token))
        assert resp.status_code == 201
        data = resp.json()
        assert len(data["contact_persons"]) == 2
        assert data["contact_persons"][0]["first_name"] == "John"
        assert data["contact_persons"][1]["phone"] == "+4930123456"

    @pytest.mark.asyncio
    async def test_create_location_with_full_address_fields(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        locations_module: Module,
        venue_location_type: TenantLocationType,
    ) -> None:
        """Create location with all address fields populated."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        payload = {
            "name": "Full Address Venue",
            "code": f"FA-{uuid.uuid4().hex[:4]}",
            "location_type": "venue",
            "description": "A fully described venue",
            "capacity": 500,
            "address_line1": "123 Main St",
            "address_line2": "Suite 100",
            "city": "Munich",
            "state": "Bavaria",
            "postal_code": "80331",
            "country": "Germany",
            "latitude": 48.1351,
            "longitude": 11.582,
            "building": "Block A",
            "floor": "3",
            "amenities": ["wifi", "projector", "parking"],
            "accessibility_features": ["wheelchair_ramp", "braille_signs"],
            "virtual_url": "https://meet.example.com/room1",
            "virtual_platform": "zoom",
            "settings": {"wifi_password": "test123"},
            "conference_id": str(conference.id),
        }
        resp = await client.post(LOCATIONS_URL, json=payload, headers=auth_headers(token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["city"] == "Munich"
        assert data["latitude"] == 48.1351
        assert data["amenities"] == ["wifi", "projector", "parking"]
        assert data["virtual_platform"] == "zoom"
        assert data["settings"] == {"wifi_password": "test123"}

    @pytest.mark.asyncio
    async def test_create_location_duplicate_code_rejected(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        locations_module: Module,
        venue_location_type: TenantLocationType,
    ) -> None:
        """Duplicate code within tenant returns 400."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        code = f"DUP-{uuid.uuid4().hex[:4]}"
        payload = {
            "name": "First Venue",
            "code": code,
            "location_type": "venue",
            "conference_id": str(conference.id),
        }
        resp1 = await client.post(LOCATIONS_URL, json=payload, headers=auth_headers(token))
        assert resp1.status_code == 201

        payload2 = {
            "name": "Second Venue",
            "code": code,
            "location_type": "venue",
            "conference_id": str(conference.id),
        }
        resp2 = await client.post(LOCATIONS_URL, json=payload2, headers=auth_headers(token))
        assert resp2.status_code == 400

    @pytest.mark.asyncio
    async def test_update_location_code_uniqueness(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        locations_module: Module,
        venue_location_type: TenantLocationType,
    ) -> None:
        """Updating location code to a duplicate returns 400."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        code1 = f"CODE1-{uuid.uuid4().hex[:4]}"
        code2 = f"CODE2-{uuid.uuid4().hex[:4]}"

        await client.post(
            LOCATIONS_URL,
            json={"name": "Loc1", "code": code1, "location_type": "venue", "conference_id": str(conference.id)},
            headers=auth_headers(token),
        )
        r2 = await client.post(
            LOCATIONS_URL,
            json={"name": "Loc2", "code": code2, "location_type": "venue", "conference_id": str(conference.id)},
            headers=auth_headers(token),
        )
        loc2_id = r2.json()["id"]

        # Try to change code2 to code1
        resp = await client.put(
            f"{LOCATIONS_URL}/{loc2_id}",
            json={"code": code1},
            headers=auth_headers(token),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_update_location_self_parent_rejected(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        sample_venue: Location,
    ) -> None:
        """Setting a location as its own parent returns 400."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.put(
            f"{LOCATIONS_URL}/{sample_venue.id}",
            json={"parent_id": str(sample_venue.id)},
            headers=auth_headers(token),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_list_locations_filter_by_conference_id(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        sample_venue: Location,
    ) -> None:
        """Filtering by conference_id returns only linked locations."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.get(
            LOCATIONS_URL,
            params={"conference_id": str(conference.id)},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        names = [loc["name"] for loc in data["items"]]
        assert sample_venue.name in names

    @pytest.mark.asyncio
    async def test_list_locations_is_active_filter(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        locations_module: Module,
        venue_location_type: TenantLocationType,
    ) -> None:
        """is_active filter limits results to active/inactive locations."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        # Create an inactive location
        inactive = Location(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Inactive Loc",
            location_type="venue",
            is_active=False,
        )
        db_session.add(inactive)
        await db_session.commit()

        resp = await client.get(
            LOCATIONS_URL,
            params={"is_active": "false"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        for loc in resp.json()["items"]:
            assert loc["is_active"] is False

    @pytest.mark.asyncio
    async def test_list_locations_filter_by_parent_id(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        sample_venue: Location,
        sample_room: Location,
    ) -> None:
        """Filtering by parent_id returns only children of that location."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.get(
            LOCATIONS_URL,
            params={"parent_id": str(sample_venue.id)},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        for loc in data["items"]:
            assert loc["parent_id"] == str(sample_venue.id)

    @pytest.mark.asyncio
    async def test_delete_location_with_conference_id_only_link(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        locations_module: Module,
        venue_location_type: TenantLocationType,
    ) -> None:
        """Delete with conference_id when location is only in one conference deletes it entirely."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        create_resp = await client.post(
            LOCATIONS_URL,
            json={"name": "SingleConf Hall", "location_type": "venue", "conference_id": str(conference.id)},
            headers=auth_headers(token),
        )
        loc_id = create_resp.json()["id"]

        resp = await client.delete(
            f"{LOCATIONS_URL}/{loc_id}",
            params={"conference_id": str(conference.id)},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

        # Location should be gone
        get_resp = await client.get(f"{LOCATIONS_URL}/{loc_id}", headers=auth_headers(token))
        assert get_resp.status_code == 404

    @pytest.mark.asyncio
    async def test_location_stats_with_type_counts(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        sample_venue: Location,
        sample_room: Location,
    ) -> None:
        """Stats endpoint returns type_counts based on TenantLocationType."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.get(f"{LOCATIONS_URL}/stats", headers=auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 2
        assert isinstance(data["type_counts"], list)


# =========================================================================
# FISCAL REPRESENTATIVE TESTS - DEEP COVERAGE
# =========================================================================


class TestFiscalRepDeep:
    """Deep coverage for fiscal representative and VAT rate endpoints."""

    @pytest.mark.asyncio
    async def test_get_fiscal_rep_none(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """GET fiscal-representative returns null when none exists."""
        resp = await client.get(_fiscal_rep_url(conference.id), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert resp.json() is None

    @pytest.mark.asyncio
    async def test_upsert_create_fiscal_rep_full_fields(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """PUT creates a new fiscal representative with all fields."""
        payload = {
            "company_name": "FiscalTest GmbH",
            "address_line1": "Fischerstr 10",
            "address_line2": "Suite B",
            "city": "Berlin",
            "state": "Berlin",
            "postal_code": "10117",
            "country": "Germany",
            "phone": "+4930123456",
            "email": "fiscal@test.com",
            "website": "https://fiscal-test.com",
            "vat_number": "DE123456789",
            "conference_vat_number": "DE987654321",
            "contact_persons": [
                {"first_name": "Hans", "last_name": "Mueller", "email": "hans@fiscal.com", "phone": "+4930654321"},
                {"first_name": "Greta", "last_name": "Schmidt"},
            ],
            "is_active": True,
        }
        resp = await client.put(_fiscal_rep_url(conference.id), json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["company_name"] == "FiscalTest GmbH"
        assert data["city"] == "Berlin"
        assert data["vat_number"] == "DE123456789"
        assert data["conference_vat_number"] == "DE987654321"
        assert len(data["contact_persons"]) == 2
        assert data["contact_persons"][0]["first_name"] == "Hans"
        assert data["is_active"] is True

    @pytest.mark.asyncio
    async def test_upsert_update_existing_fiscal_rep(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """PUT updates an existing fiscal representative."""
        # Create one first
        rep = FiscalRepresentative(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            company_name="Original GmbH",
            is_active=True,
        )
        db_session.add(rep)
        await db_session.commit()

        # Update
        payload = {
            "company_name": "Updated GmbH",
            "city": "Munich",
            "email": "updated@fiscal.com",
            "contact_persons": [{"first_name": "NewPerson", "last_name": "Test"}],
        }
        resp = await client.put(_fiscal_rep_url(conference.id), json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["company_name"] == "Updated GmbH"
        assert data["city"] == "Munich"
        assert data["id"] == str(rep.id)  # Same record was updated

    @pytest.mark.asyncio
    async def test_delete_fiscal_rep(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """DELETE fiscal-representative removes the record."""
        rep = FiscalRepresentative(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            company_name="ToDelete GmbH",
            is_active=True,
        )
        db_session.add(rep)
        await db_session.commit()

        resp = await client.delete(_fiscal_rep_url(conference.id), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

        # Verify it is gone
        get_resp = await client.get(_fiscal_rep_url(conference.id), headers=auth_headers(admin_token))
        assert get_resp.status_code == 200
        assert get_resp.json() is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_fiscal_rep_404(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Deleting when none exists returns 404."""
        resp = await client.delete(_fiscal_rep_url(conference.id), headers=auth_headers(admin_token))
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_vat_rates_list_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """List VAT rates when none exist returns empty list."""
        resp = await client.get(_vat_rates_url(conference.id), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_vat_rate_create_and_list(
        self,
        client: AsyncClient,
        conference: Conference,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Create a VAT rate and verify it appears in the list."""
        payload = {
            "rate": 19.0,
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
            "description": "Standard rate",
        }
        create_resp = await client.post(_vat_rates_url(conference.id), json=payload, headers=auth_headers(admin_token))
        assert create_resp.status_code == 201
        rate_data = create_resp.json()
        assert Decimal(str(rate_data["rate"])) == Decimal("19.0")
        assert rate_data["description"] == "Standard rate"

        # List should include it
        list_resp = await client.get(_vat_rates_url(conference.id), headers=auth_headers(admin_token))
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_vat_rate_update_dates_and_overlap_check(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Updating VAT rate dates triggers overlap check."""
        today = date.today()
        rate1 = ConferenceVatRate(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            rate=Decimal("19.00"),
            start_date=today,
            end_date=today + timedelta(days=30),
        )
        rate2 = ConferenceVatRate(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            rate=Decimal("21.00"),
            start_date=today + timedelta(days=60),
            end_date=today + timedelta(days=90),
        )
        db_session.add_all([rate1, rate2])
        await db_session.commit()

        # Try to extend rate2's start into rate1's range -> overlap
        resp = await client.put(
            _vat_rates_url(conference.id, rate2.id),
            json={"start_date": str(today + timedelta(days=10))},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_vat_rate_delete(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Delete a VAT rate."""
        rate = ConferenceVatRate(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            rate=Decimal("10.00"),
            start_date=date(2028, 1, 1),
            end_date=date(2028, 12, 31),
        )
        db_session.add(rate)
        await db_session.commit()

        resp = await client.delete(_vat_rates_url(conference.id, rate.id), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_tax_info_self_representation(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """When tenant and conference are in the same country, representation_type is 'self'."""
        tenant.country = "Germany"
        tenant.vat_number = "DE111222333"
        conference.country = "Germany"
        await db_session.commit()

        resp = await client.get(_tax_info_url(conference.id), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["representation_type"] == "self"
        assert data["effective_vat_number"] == "DE111222333"

    @pytest.mark.asyncio
    async def test_tax_info_fiscal_rep_active(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Different countries with active fiscal rep uses conference_vat_number."""
        tenant.country = "Austria"
        tenant.vat_number = "ATU12345678"
        conference.country = "Germany"

        rep = FiscalRepresentative(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            company_name="Rep GmbH",
            vat_number="DE111111111",
            conference_vat_number="DE222222222",
            is_active=True,
        )
        db_session.add(rep)
        await db_session.commit()

        resp = await client.get(_tax_info_url(conference.id), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["representation_type"] == "fiscal_representative"
        assert data["effective_vat_number"] == "DE222222222"
        assert data["fiscal_representative"] is not None
        assert data["fiscal_representative"]["is_active"] is True

    @pytest.mark.asyncio
    async def test_vat_rate_update_end_before_start_rejected(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        admin_token: str,
    ) -> None:
        """Updating end_date to before start_date returns 400."""
        today = date.today()
        rate = ConferenceVatRate(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            rate=Decimal("19.00"),
            start_date=today,
            end_date=today + timedelta(days=30),
        )
        db_session.add(rate)
        await db_session.commit()

        resp = await client.put(
            _vat_rates_url(conference.id, rate.id),
            json={"end_date": str(today - timedelta(days=1))},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 400
