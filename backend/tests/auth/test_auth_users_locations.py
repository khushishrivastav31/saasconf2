"""Comprehensive integration tests for auth, users, and locations endpoints.

Covers authentication flows, user CRUD with authorization checks,
and location management including hierarchical (tree) operations.
"""

import uuid
from datetime import timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import generate_email_verification_token
from app.core.security import hash_password
from app.core.utils import utcnow
from app.models.associations import ConferenceLocation
from app.models.conference import Conference
from app.models.location import Location
from app.models.module import Module, TenantModule
from app.models.settings import TenantLocationType
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.user_password_reset import UserPasswordReset
from tests.conftest import _make_token, auth_headers

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

AUTH_URL = "/api/v1/auth"
USERS_URL = "/api/v1/users"
LOCATIONS_URL = "/api/v1/locations"

DEFAULT_PASSWORD = "Password123!"


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def locations_module(db_session: AsyncSession, tenant: Tenant) -> Module:
    """Create the 'locations' module and enable it for the tenant."""
    mod = Module(
        id=uuid.uuid4(),
        name="Locations",
        code="locations",
        description="Location management",
        is_active=True,
    )
    db_session.add(mod)
    await db_session.flush()
    tm = TenantModule(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        module_id=mod.id,
        is_enabled=True,
    )
    db_session.add(tm)
    await db_session.commit()
    return mod


@pytest_asyncio.fixture()
async def venue_location_type(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> TenantLocationType:
    """Create a 'venue' location type for the tenant."""
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
    """Create a 'room' location type for the tenant."""
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
    """Create a sample venue location linked to the conference."""
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
    """Create a sample room as a child of the sample venue."""
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


# ---------------------------------------------------------------------------
# Auth Tests
# ---------------------------------------------------------------------------


class TestAuth:
    """Tests for /api/v1/auth/ endpoints."""

    # -- Login --

    @pytest.mark.asyncio
    async def test_login_valid_credentials(self, client: AsyncClient, tenant_admin_user: User) -> None:
        """Login with correct email/password returns access + refresh tokens."""
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
    async def test_login_wrong_password(self, client: AsyncClient, tenant_admin_user: User) -> None:
        """Wrong password returns 401."""
        resp = await client.post(
            f"{AUTH_URL}/login",
            json={"email": tenant_admin_user.email, "password": "WrongPassword9!"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_login_nonexistent_email(self, client: AsyncClient) -> None:
        """Non-existent email returns 401."""
        resp = await client.post(
            f"{AUTH_URL}/login",
            json={"email": "ghost@nowhere.io", "password": DEFAULT_PASSWORD},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_login_deactivated_user(self, client: AsyncClient, db_session: AsyncSession, tenant: Tenant) -> None:
        """Deactivated user cannot log in (401)."""
        user = User(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            email=f"deactivated-{uuid.uuid4().hex[:8]}@test.com",
            password_hash=hash_password(DEFAULT_PASSWORD),
            first_name="Deactivated",
            last_name="Person",
            role=UserRole.USER.value,
            is_active=False,
        )
        db_session.add(user)
        await db_session.commit()

        resp = await client.post(
            f"{AUTH_URL}/login",
            json={"email": user.email, "password": DEFAULT_PASSWORD},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_login_deactivated_tenant(self, client: AsyncClient, db_session: AsyncSession) -> None:
        """User in a deactivated tenant cannot log in."""
        t = Tenant(
            id=uuid.uuid4(),
            name="Dead Tenant",
            slug=f"dead-{uuid.uuid4().hex[:8]}",
            is_active=False,
        )
        db_session.add(t)
        await db_session.flush()
        u = User(
            id=uuid.uuid4(),
            tenant_id=t.id,
            email=f"deadtenant-{uuid.uuid4().hex[:8]}@test.com",
            password_hash=hash_password(DEFAULT_PASSWORD),
            first_name="Dead",
            last_name="Tenant",
            role=UserRole.USER.value,
            is_active=True,
        )
        db_session.add(u)
        await db_session.commit()

        resp = await client.post(
            f"{AUTH_URL}/login",
            json={"email": u.email, "password": DEFAULT_PASSWORD},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_login_case_insensitive_email(self, client: AsyncClient, tenant_admin_user: User) -> None:
        """Email lookup is case-insensitive."""
        resp = await client.post(
            f"{AUTH_URL}/login",
            json={
                "email": tenant_admin_user.email.upper(),
                "password": DEFAULT_PASSWORD,
            },
        )
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    # -- /me --

    @pytest.mark.asyncio
    async def test_me_returns_current_user(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """GET /me returns the authenticated user's profile."""
        resp = await client.get(f"{AUTH_URL}/me", headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == tenant_admin_user.email
        assert data["role"] == "tenant_admin"
        assert data["is_active"] is True

    @pytest.mark.asyncio
    async def test_me_without_token(self, client: AsyncClient) -> None:
        """GET /me without Authorization header returns 401."""
        resp = await client.get(f"{AUTH_URL}/me")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_me_with_invalid_token(self, client: AsyncClient) -> None:
        """GET /me with a garbage token returns 401."""
        resp = await client.get(f"{AUTH_URL}/me", headers={"Authorization": "Bearer garbage.token.here"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_me_includes_modules(
        self,
        client: AsyncClient,
        tenant_with_modules: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """GET /me returns the tenant's enabled modules."""
        resp = await client.get(f"{AUTH_URL}/me", headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 200
        assert "conferences" in resp.json()["modules"]

    # -- Preferences --

    @pytest.mark.asyncio
    async def test_update_preferences_theme(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """PATCH /me/preferences can set theme_preference."""
        resp = await client.patch(
            f"{AUTH_URL}/me/preferences",
            json={"theme_preference": "dark"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["theme_preference"] == "dark"

    @pytest.mark.asyncio
    async def test_update_preferences_notifications(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """PATCH /me/preferences can toggle notifications off."""
        resp = await client.patch(
            f"{AUTH_URL}/me/preferences",
            json={"message_notifications_enabled": False},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["message_notifications_enabled"] is False

    # -- Logout --

    @pytest.mark.asyncio
    async def test_logout_success(self, client: AsyncClient, tenant_admin_token: str) -> None:
        """POST /logout revokes tokens and returns success."""
        resp = await client.post(f"{AUTH_URL}/logout", headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 200
        assert resp.json()["message"] == "Successfully logged out"

    @pytest.mark.asyncio
    async def test_logout_without_token(self, client: AsyncClient) -> None:
        """POST /logout without token returns 401."""
        resp = await client.post(f"{AUTH_URL}/logout")
        assert resp.status_code == 401

    # -- Refresh --

    @pytest.mark.asyncio
    async def test_refresh_rotates_tokens(self, client: AsyncClient, tenant_admin_user: User) -> None:
        """POST /refresh issues new tokens and rotates the refresh token."""
        login_resp = await client.post(
            f"{AUTH_URL}/login",
            json={"email": tenant_admin_user.email, "password": DEFAULT_PASSWORD},
        )
        assert login_resp.status_code == 200
        old_refresh = login_resp.json()["refresh_token"]

        refresh_resp = await client.post(f"{AUTH_URL}/refresh", json={"refresh_token": old_refresh})
        assert refresh_resp.status_code == 200
        data = refresh_resp.json()
        assert "access_token" in data
        assert data["refresh_token"] != old_refresh

    @pytest.mark.asyncio
    async def test_refresh_with_invalid_token(self, client: AsyncClient) -> None:
        """POST /refresh with a bogus token returns 401."""
        resp = await client.post(f"{AUTH_URL}/refresh", json={"refresh_token": "bogus-token"})
        assert resp.status_code == 401

    # -- Forgot password --

    @pytest.mark.asyncio
    async def test_forgot_password_existing_email(self, client: AsyncClient, tenant_admin_user: User) -> None:
        """Always returns 200 with the same message regardless of existence."""
        resp = await client.post(
            f"{AUTH_URL}/forgot-password",
            json={"email": tenant_admin_user.email},
        )
        assert resp.status_code == 200
        assert "password reset link" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_forgot_password_nonexistent_email(self, client: AsyncClient) -> None:
        """Non-existent email still returns 200 to prevent enumeration."""
        resp = await client.post(
            f"{AUTH_URL}/forgot-password",
            json={"email": "nobody@nowhere.io"},
        )
        assert resp.status_code == 200
        assert "password reset link" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_forgot_password_invalid_email_format(self, client: AsyncClient) -> None:
        """Invalid email format returns 422."""
        resp = await client.post(
            f"{AUTH_URL}/forgot-password",
            json={"email": "not-an-email"},
        )
        assert resp.status_code == 422

    # -- Reset password --

    @pytest.mark.asyncio
    async def test_reset_password_valid_token(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
    ) -> None:
        """Valid reset token allows password change; new password works for login."""
        raw_token, token_hash = generate_email_verification_token()
        reset = UserPasswordReset(
            user_id=tenant_admin_user.id,
            token_hash=token_hash,
            expires_at=utcnow() + timedelta(hours=1),
        )
        db_session.add(reset)
        await db_session.commit()

        new_pw = "BrandNewPass99!"
        resp = await client.post(
            f"{AUTH_URL}/reset-password",
            json={"token": raw_token, "new_password": new_pw},
        )
        assert resp.status_code == 200
        assert "successfully" in resp.json()["message"].lower()

        # Verify login with new password
        login_resp = await client.post(
            f"{AUTH_URL}/login",
            json={"email": tenant_admin_user.email, "password": new_pw},
        )
        assert login_resp.status_code == 200

    @pytest.mark.asyncio
    async def test_reset_password_expired_token(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
    ) -> None:
        """Expired reset token returns 401."""
        raw_token, token_hash = generate_email_verification_token()
        reset = UserPasswordReset(
            user_id=tenant_admin_user.id,
            token_hash=token_hash,
            expires_at=utcnow() - timedelta(hours=1),
        )
        db_session.add(reset)
        await db_session.commit()

        resp = await client.post(
            f"{AUTH_URL}/reset-password",
            json={"token": raw_token, "new_password": "NewPass123!"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_reset_password_invalid_token(self, client: AsyncClient) -> None:
        """Completely bogus token returns 401."""
        resp = await client.post(
            f"{AUTH_URL}/reset-password",
            json={"token": "nonexistent-token", "new_password": "NewPass123!"},
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Users Tests
# ---------------------------------------------------------------------------


class TestUsers:
    """Tests for /api/v1/users/ endpoints."""

    # -- List --

    @pytest.mark.asyncio
    async def test_list_users_as_admin(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Tenant admin can list users and sees themselves."""
        resp = await client.get(USERS_URL, headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert data["page"] == 1
        assert data["page_size"] == 20
        emails = [u["email"] for u in data["items"]]
        assert tenant_admin_user.email in emails

    @pytest.mark.asyncio
    async def test_list_users_pagination(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Pagination parameters are respected."""
        # Create a few extra users
        for i in range(3):
            await client.post(
                USERS_URL,
                json={
                    "email": f"page-user-{i}-{uuid.uuid4().hex[:6]}@test.com",
                    "password": DEFAULT_PASSWORD,
                    "first_name": f"Page{i}",
                    "last_name": "User",
                    "role": "user",
                },
                headers=auth_headers(tenant_admin_token),
            )

        resp = await client.get(
            USERS_URL,
            params={"page": 1, "page_size": 2},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) <= 2
        assert data["page_size"] == 2
        assert data["total"] >= 4  # admin + 3 created

    @pytest.mark.asyncio
    async def test_list_users_search(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Search filter narrows results by name (partial) and email (exact — encrypted column)."""
        unique = uuid.uuid4().hex[:8]
        email = f"searchable-{unique}@test.com"
        last_name = f"SearchablePerson{unique}"
        await client.post(
            USERS_URL,
            json={
                "email": email,
                "password": DEFAULT_PASSWORD,
                "first_name": "Searchable",
                "last_name": last_name,
                "role": "user",
            },
            headers=auth_headers(tenant_admin_token),
        )

        # Partial last-name search (plaintext column — still ilike-searchable)
        resp = await client.get(
            USERS_URL,
            params={"search": unique},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert any(u["last_name"] == last_name for u in data["items"])

        # Exact email lookup (encrypted column — only exact hash match works)
        resp = await client.get(
            USERS_URL,
            params={"search": email},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert any(u["email"] == email for u in data["items"])

    @pytest.mark.asyncio
    async def test_list_users_is_active_filter(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """is_active filter returns only active or inactive users."""
        # Create a user and then deactivate them
        create_resp = await client.post(
            USERS_URL,
            json={
                "email": f"filterable-{uuid.uuid4().hex[:8]}@test.com",
                "password": DEFAULT_PASSWORD,
                "first_name": "Filterable",
                "last_name": "User",
                "role": "user",
            },
            headers=auth_headers(tenant_admin_token),
        )
        assert create_resp.status_code == 201
        uid = create_resp.json()["id"]
        await client.delete(f"{USERS_URL}/{uid}", headers=auth_headers(tenant_admin_token))

        # Filter active only
        resp = await client.get(
            USERS_URL,
            params={"is_active": "true"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        for u in resp.json()["items"]:
            assert u["is_active"] is True

        # Filter inactive only
        resp2 = await client.get(
            USERS_URL,
            params={"is_active": "false"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp2.status_code == 200
        for u in resp2.json()["items"]:
            assert u["is_active"] is False

    @pytest.mark.asyncio
    async def test_list_users_forbidden_for_regular_user(
        self,
        client: AsyncClient,
        tenant: Tenant,
        regular_user: User,
        regular_user_token: str,
    ) -> None:
        """Regular (non-admin) users cannot list users (403)."""
        resp = await client.get(USERS_URL, headers=auth_headers(regular_user_token))
        assert resp.status_code == 403

    # -- Create --

    @pytest.mark.asyncio
    async def test_create_user_with_password(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Tenant admin creates a user with a password; user is immediately active."""
        payload = {
            "email": f"new-{uuid.uuid4().hex[:8]}@test.com",
            "password": DEFAULT_PASSWORD,
            "first_name": "Fresh",
            "last_name": "User",
            "role": "user",
        }
        resp = await client.post(USERS_URL, json=payload, headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == payload["email"]
        assert data["first_name"] == "Fresh"
        assert data["role"] == "user"
        assert data["is_active"] is True
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_user_without_password_invite_flow(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Omitting password triggers the invite flow; user has no last_login."""
        payload = {
            "email": f"invite-{uuid.uuid4().hex[:8]}@test.com",
            "first_name": "Invited",
            "last_name": "Person",
            "role": "user",
        }
        resp = await client.post(USERS_URL, json=payload, headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["last_login"] is None
        assert data["is_active"] is True

    @pytest.mark.asyncio
    async def test_create_user_duplicate_email(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Duplicate email within the same tenant returns 400."""
        payload = {
            "email": f"dup-{uuid.uuid4().hex[:8]}@test.com",
            "password": DEFAULT_PASSWORD,
            "first_name": "Dup",
            "last_name": "User",
            "role": "user",
        }
        resp1 = await client.post(USERS_URL, json=payload, headers=auth_headers(tenant_admin_token))
        assert resp1.status_code == 201

        resp2 = await client.post(USERS_URL, json=payload, headers=auth_headers(tenant_admin_token))
        assert resp2.status_code == 400

    @pytest.mark.asyncio
    async def test_create_user_cannot_create_super_admin(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Attempting to create a super_admin role returns 403."""
        payload = {
            "email": f"sa-{uuid.uuid4().hex[:8]}@test.com",
            "password": DEFAULT_PASSWORD,
            "first_name": "Fake",
            "last_name": "SA",
            "role": "super_admin",
        }
        resp = await client.post(USERS_URL, json=payload, headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_create_user_as_tenant_admin_role(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Admin can create another tenant_admin within the tenant."""
        payload = {
            "email": f"ta-{uuid.uuid4().hex[:8]}@test.com",
            "password": DEFAULT_PASSWORD,
            "first_name": "Another",
            "last_name": "Admin",
            "role": "tenant_admin",
        }
        resp = await client.post(USERS_URL, json=payload, headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 201
        assert resp.json()["role"] == "tenant_admin"

    @pytest.mark.asyncio
    async def test_create_user_forbidden_for_regular_user(
        self,
        client: AsyncClient,
        tenant: Tenant,
        regular_user: User,
        regular_user_token: str,
    ) -> None:
        """Regular users cannot create users (403)."""
        payload = {
            "email": f"blocked-{uuid.uuid4().hex[:8]}@test.com",
            "password": DEFAULT_PASSWORD,
            "first_name": "Blocked",
            "last_name": "User",
            "role": "user",
        }
        resp = await client.post(USERS_URL, json=payload, headers=auth_headers(regular_user_token))
        assert resp.status_code == 403

    # -- Get --

    @pytest.mark.asyncio
    async def test_get_user_by_id(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Fetch a user by ID returns correct data."""
        create_resp = await client.post(
            USERS_URL,
            json={
                "email": f"getme-{uuid.uuid4().hex[:8]}@test.com",
                "password": DEFAULT_PASSWORD,
                "first_name": "GetMe",
                "last_name": "User",
                "role": "user",
            },
            headers=auth_headers(tenant_admin_token),
        )
        assert create_resp.status_code == 201
        uid = create_resp.json()["id"]

        resp = await client.get(f"{USERS_URL}/{uid}", headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 200
        assert resp.json()["id"] == uid

    @pytest.mark.asyncio
    async def test_get_nonexistent_user(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Getting a non-existent user returns 404."""
        fake_id = uuid.uuid4()
        resp = await client.get(f"{USERS_URL}/{fake_id}", headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 404

    # -- Update --

    @pytest.mark.asyncio
    async def test_update_user_name(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Updating first_name and last_name succeeds."""
        create_resp = await client.post(
            USERS_URL,
            json={
                "email": f"upd-{uuid.uuid4().hex[:8]}@test.com",
                "password": DEFAULT_PASSWORD,
                "first_name": "Old",
                "last_name": "Name",
                "role": "user",
            },
            headers=auth_headers(tenant_admin_token),
        )
        uid = create_resp.json()["id"]

        resp = await client.put(
            f"{USERS_URL}/{uid}",
            json={"first_name": "New", "last_name": "NameUpdated"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["first_name"] == "New"
        assert data["last_name"] == "NameUpdated"

    @pytest.mark.asyncio
    async def test_update_user_role(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """An admin can promote a regular user to tenant_admin."""
        create_resp = await client.post(
            USERS_URL,
            json={
                "email": f"promote-{uuid.uuid4().hex[:8]}@test.com",
                "password": DEFAULT_PASSWORD,
                "first_name": "ToPromote",
                "last_name": "User",
                "role": "user",
            },
            headers=auth_headers(tenant_admin_token),
        )
        uid = create_resp.json()["id"]

        resp = await client.put(
            f"{USERS_URL}/{uid}",
            json={"role": "tenant_admin"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "tenant_admin"

    @pytest.mark.asyncio
    async def test_update_user_cannot_promote_to_super_admin(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Cannot promote to super_admin role (403)."""
        create_resp = await client.post(
            USERS_URL,
            json={
                "email": f"nosa-{uuid.uuid4().hex[:8]}@test.com",
                "password": DEFAULT_PASSWORD,
                "first_name": "No",
                "last_name": "SA",
                "role": "user",
            },
            headers=auth_headers(tenant_admin_token),
        )
        uid = create_resp.json()["id"]

        resp = await client.put(
            f"{USERS_URL}/{uid}",
            json={"role": "super_admin"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 403

    # -- Delete / Deactivate --

    @pytest.mark.asyncio
    async def test_deactivate_user_soft_delete(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Default DELETE soft-deactivates the user."""
        create_resp = await client.post(
            USERS_URL,
            json={
                "email": f"soft-{uuid.uuid4().hex[:8]}@test.com",
                "password": DEFAULT_PASSWORD,
                "first_name": "Soft",
                "last_name": "Delete",
                "role": "user",
            },
            headers=auth_headers(tenant_admin_token),
        )
        uid = create_resp.json()["id"]

        resp = await client.delete(f"{USERS_URL}/{uid}", headers=auth_headers(tenant_admin_token))
        assert resp.status_code == 200
        assert "deactivated" in resp.json()["message"].lower()

        # User still exists but is inactive
        get_resp = await client.get(f"{USERS_URL}/{uid}", headers=auth_headers(tenant_admin_token))
        assert get_resp.status_code == 200
        assert get_resp.json()["is_active"] is False

    @pytest.mark.asyncio
    async def test_permanent_delete_user(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """DELETE with permanent=true as tenant admin permanently removes user."""
        create_resp = await client.post(
            USERS_URL,
            json={
                "email": f"perm-{uuid.uuid4().hex[:8]}@test.com",
                "password": DEFAULT_PASSWORD,
                "first_name": "Perm",
                "last_name": "Delete",
                "role": "user",
            },
            headers=auth_headers(tenant_admin_token),
        )
        uid = create_resp.json()["id"]

        resp = await client.delete(
            f"{USERS_URL}/{uid}",
            params={"permanent": "true"},
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert "permanently deleted" in resp.json()["message"].lower()

        # User no longer exists
        get_resp = await client.get(f"{USERS_URL}/{uid}", headers=auth_headers(tenant_admin_token))
        assert get_resp.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_delete_self(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """An admin cannot delete their own account."""
        resp = await client.delete(
            f"{USERS_URL}/{tenant_admin_user.id}",
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 400

    # -- Resend invite --

    @pytest.mark.asyncio
    async def test_resend_invite_success(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Resending an invite for a never-logged-in user succeeds."""
        create_resp = await client.post(
            USERS_URL,
            json={
                "email": f"reinvite-{uuid.uuid4().hex[:8]}@test.com",
                "first_name": "Reinvite",
                "last_name": "Target",
                "role": "user",
            },
            headers=auth_headers(tenant_admin_token),
        )
        uid = create_resp.json()["id"]

        resp = await client.post(
            f"{USERS_URL}/{uid}/resend-invite",
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert "resent" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_resend_invite_nonexistent_user(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Resending invite for non-existent user returns 404."""
        resp = await client.post(
            f"{USERS_URL}/{uuid.uuid4()}/resend-invite",
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_resend_invite_forbidden_for_regular_user(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
        regular_user: User,
        regular_user_token: str,
    ) -> None:
        """Regular users cannot resend invites (403)."""
        create_resp = await client.post(
            USERS_URL,
            json={
                "email": f"noreinvite-{uuid.uuid4().hex[:8]}@test.com",
                "first_name": "No",
                "last_name": "Reinvite",
                "role": "user",
            },
            headers=auth_headers(tenant_admin_token),
        )
        uid = create_resp.json()["id"]

        resp = await client.post(
            f"{USERS_URL}/{uid}/resend-invite",
            headers=auth_headers(regular_user_token),
        )
        assert resp.status_code == 403

    # -- Pronoun options --

    @pytest.mark.asyncio
    async def test_pronoun_options_empty(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        tenant_admin_token: str,
    ) -> None:
        """Pronoun options returns an empty list when none are configured."""
        resp = await client.get(
            f"{USERS_URL}/pronoun-options",
            headers=auth_headers(tenant_admin_token),
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ---------------------------------------------------------------------------
# Locations Tests
# ---------------------------------------------------------------------------


class TestLocations:
    """Tests for /api/v1/locations/ endpoints."""

    # -- List --

    @pytest.mark.asyncio
    async def test_list_locations_empty(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        tenant_admin_user: User,
        locations_module: Module,
    ) -> None:
        """Empty tenant returns zero locations."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.get(LOCATIONS_URL, headers=auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_list_locations_with_data(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        sample_venue: Location,
        sample_room: Location,
    ) -> None:
        """Listing locations includes existing venues and rooms."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.get(LOCATIONS_URL, headers=auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 2
        names = [loc["name"] for loc in data["items"]]
        assert sample_venue.name in names

    @pytest.mark.asyncio
    async def test_list_locations_type_filter(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        sample_venue: Location,
        sample_room: Location,
    ) -> None:
        """Filtering by location_type returns only matching locations."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.get(
            LOCATIONS_URL,
            params={"location_type": "room"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        for loc in resp.json()["items"]:
            assert loc["location_type"] == "room"

    @pytest.mark.asyncio
    async def test_list_locations_search(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        sample_venue: Location,
    ) -> None:
        """Search by name narrows results."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.get(
            LOCATIONS_URL,
            params={"search": "Grand"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1
        assert any("Grand" in loc["name"] for loc in resp.json()["items"])

    @pytest.mark.asyncio
    async def test_list_locations_requires_module(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Without the 'locations' module enabled, listing returns 403."""
        token = _make_token(tenant_admin_user, modules=["conferences"])
        resp = await client.get(LOCATIONS_URL, headers=auth_headers(token))
        assert resp.status_code == 403

    # -- Create --

    @pytest.mark.asyncio
    async def test_create_location(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        locations_module: Module,
        venue_location_type: TenantLocationType,
    ) -> None:
        """Tenant admin creates a venue location linked to the conference."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        payload = {
            "name": "New Venue",
            "code": "NV-01",
            "location_type": "venue",
            "capacity": 300,
            "city": "Munich",
            "country": "Germany",
            "conference_id": str(conference.id),
        }
        resp = await client.post(LOCATIONS_URL, json=payload, headers=auth_headers(token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "New Venue"
        assert data["location_type"] == "venue"
        assert data["capacity"] == 300
        assert str(conference.id) in data["conference_ids"]

    @pytest.mark.asyncio
    async def test_create_location_with_parent(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        sample_venue: Location,
        room_location_type: TenantLocationType,
    ) -> None:
        """Creating a room with a parent_id succeeds."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        payload = {
            "name": "Breakout Room B",
            "location_type": "room",
            "parent_id": str(sample_venue.id),
            "capacity": 30,
            "conference_id": str(conference.id),
        }
        resp = await client.post(LOCATIONS_URL, json=payload, headers=auth_headers(token))
        assert resp.status_code == 201
        data = resp.json()
        assert data["parent_id"] == str(sample_venue.id)

    @pytest.mark.asyncio
    async def test_create_location_invalid_type(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        locations_module: Module,
    ) -> None:
        """Creating a location with an unconfigured type returns 400."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        payload = {
            "name": "Bad Type Location",
            "location_type": "spaceship",
            "conference_id": str(conference.id),
        }
        resp = await client.post(LOCATIONS_URL, json=payload, headers=auth_headers(token))
        assert resp.status_code == 400

    # -- Get --

    @pytest.mark.asyncio
    async def test_get_location_by_id(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        sample_venue: Location,
    ) -> None:
        """Fetching a location by ID returns it with children_count."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.get(f"{LOCATIONS_URL}/{sample_venue.id}", headers=auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(sample_venue.id)
        assert data["name"] == sample_venue.name

    @pytest.mark.asyncio
    async def test_get_location_not_found(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        locations_module: Module,
    ) -> None:
        """Non-existent location returns 404."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.get(f"{LOCATIONS_URL}/{uuid.uuid4()}", headers=auth_headers(token))
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_get_location_children_count(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        sample_venue: Location,
        sample_room: Location,
    ) -> None:
        """Venue with a child room shows children_count >= 1."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.get(f"{LOCATIONS_URL}/{sample_venue.id}", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json()["children_count"] >= 1

    # -- Update --

    @pytest.mark.asyncio
    async def test_update_location(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        sample_venue: Location,
    ) -> None:
        """Updating a location changes its fields."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.put(
            f"{LOCATIONS_URL}/{sample_venue.id}",
            json={"name": "Renamed Venue", "capacity": 5000},
            headers=auth_headers(token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Renamed Venue"
        assert data["capacity"] == 5000

    @pytest.mark.asyncio
    async def test_update_location_not_found(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        locations_module: Module,
    ) -> None:
        """Updating a non-existent location returns 404."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.put(
            f"{LOCATIONS_URL}/{uuid.uuid4()}",
            json={"name": "Ghost"},
            headers=auth_headers(token),
        )
        assert resp.status_code == 404

    # -- Delete --

    @pytest.mark.asyncio
    async def test_delete_location(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        locations_module: Module,
        venue_location_type: TenantLocationType,
    ) -> None:
        """Deleting a location removes it entirely."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        payload = {
            "name": "Disposable Hall",
            "location_type": "venue",
            "conference_id": str(conference.id),
        }
        create_resp = await client.post(LOCATIONS_URL, json=payload, headers=auth_headers(token))
        assert create_resp.status_code == 201
        loc_id = create_resp.json()["id"]

        del_resp = await client.delete(f"{LOCATIONS_URL}/{loc_id}", headers=auth_headers(token))
        assert del_resp.status_code == 200
        assert "deleted" in del_resp.json()["message"].lower()

        # Verify gone
        get_resp = await client.get(f"{LOCATIONS_URL}/{loc_id}", headers=auth_headers(token))
        assert get_resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_location_not_found(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        locations_module: Module,
    ) -> None:
        """Deleting a non-existent location returns 404."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.delete(f"{LOCATIONS_URL}/{uuid.uuid4()}", headers=auth_headers(token))
        assert resp.status_code == 404

    # -- Tree --

    @pytest.mark.asyncio
    async def test_location_tree_hierarchy(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        sample_venue: Location,
        sample_room: Location,
    ) -> None:
        """GET /tree returns a nested tree with venue containing the room."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.get(f"{LOCATIONS_URL}/tree", headers=auth_headers(token))
        assert resp.status_code == 200
        tree = resp.json()
        assert isinstance(tree, list)
        assert len(tree) >= 1

        # Find the venue in the tree
        venue_node = next((n for n in tree if n["id"] == str(sample_venue.id)), None)
        assert venue_node is not None
        assert venue_node["name"] == sample_venue.name
        assert len(venue_node["children"]) >= 1

        # Room should be a child
        room_node = next(
            (c for c in venue_node["children"] if c["id"] == str(sample_room.id)),
            None,
        )
        assert room_node is not None
        assert room_node["name"] == sample_room.name
        assert room_node["parent_id"] == str(sample_venue.id)

    @pytest.mark.asyncio
    async def test_location_tree_empty(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        locations_module: Module,
    ) -> None:
        """GET /tree on an empty tenant returns an empty list."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.get(f"{LOCATIONS_URL}/tree", headers=auth_headers(token))
        assert resp.status_code == 200
        assert resp.json() == []

    # -- Stats --

    @pytest.mark.asyncio
    async def test_location_stats(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
        sample_venue: Location,
        sample_room: Location,
    ) -> None:
        """GET /stats returns aggregate counts and capacity."""
        token = _make_token(tenant_admin_user, modules=["locations"])
        resp = await client.get(f"{LOCATIONS_URL}/stats", headers=auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 2
        assert data["total_capacity"] >= sample_venue.capacity + sample_room.capacity

    # -- Module gating --

    @pytest.mark.asyncio
    async def test_locations_require_module(
        self,
        client: AsyncClient,
        tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """All location endpoints return 403 when the module is not enabled."""
        token = _make_token(tenant_admin_user, modules=["conferences"])

        resp_list = await client.get(LOCATIONS_URL, headers=auth_headers(token))
        assert resp_list.status_code == 403

        resp_tree = await client.get(f"{LOCATIONS_URL}/tree", headers=auth_headers(token))
        assert resp_tree.status_code == 403

        resp_stats = await client.get(f"{LOCATIONS_URL}/stats", headers=auth_headers(token))
        assert resp_stats.status_code == 403

    # The "unlink one of multiple conferences" path was removed by
    # migration 220 (UNIQUE on conference_locations.location_id).
    # Coverage of the now-DB-enforced 1-conference-per-location
    # invariant lives in tests/core/test_locations.py
    # (test_location_cannot_be_linked_to_two_conferences).
