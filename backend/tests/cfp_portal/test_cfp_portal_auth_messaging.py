"""Comprehensive tests for CFP portal auth and messaging endpoints.

Covers:
- Applicant registration, login, email verification, password reset
- Profile CRUD (GET /portal/me, PUT /portal/me)
- Public tenant info and landing page
- Committee memberships listing
- Portal messaging: thread lifecycle (create, reply, archive, unarchive, mark read)
- Thread listing with pagination and filtering
- Unread count
- Cross-tenant isolation
- 401 without auth
"""

import os
import uuid
from datetime import UTC, datetime, timedelta

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

from app.core.applicant_security import (
    create_applicant_access_token,
    generate_email_verification_token,
)
from app.core.security import hash_password
from app.models.applicant_token import ApplicantPasswordReset
from app.models.cfp import CFPApplicant
from app.models.conference import Conference
from app.models.messaging import Message, MessageParticipant, MessageThread
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

PORTAL_BASE = "/api/v1/portal"


# ── Fixtures ────────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
    """Create the 'cfp' module."""
    m = Module(
        id=uuid.uuid4(),
        name="Call for Papers",
        code="cfp",
        description="CFP management",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def messaging_module(db_session: AsyncSession) -> Module:
    """Create the 'messaging' module."""
    m = Module(
        id=uuid.uuid4(),
        name="Messaging",
        code="messaging",
        description="Messaging module",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_cfp_and_messaging(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    cfp_module: Module,
    messaging_module: Module,
) -> Tenant:
    """Associate conferences, cfp, and messaging modules with the test tenant."""
    for mod in (conferences_module, cfp_module, messaging_module):
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


@pytest_asyncio.fixture()
async def verified_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create an applicant with verified email."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Jane",
        last_name="Speaker",
        email=f"jane-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        email_verified_at=datetime.now(UTC),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def unverified_applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    """Create an applicant without verified email."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Unverified",
        last_name="User",
        email=f"unverified-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest.fixture()
def applicant_token(verified_applicant: CFPApplicant, tenant: Tenant) -> str:
    """Return a valid applicant access token."""
    return create_applicant_access_token(verified_applicant.id, tenant.id)


@pytest_asyncio.fixture()
async def second_tenant(db_session: AsyncSession) -> Tenant:
    """Create a second tenant for cross-tenant isolation tests."""
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
async def other_tenant_applicant(db_session: AsyncSession, second_tenant: Tenant) -> CFPApplicant:
    """Create an applicant in a different tenant."""
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=second_tenant.id,
        first_name="Other",
        last_name="Applicant",
        email=f"other-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        email_verified_at=datetime.now(UTC),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def thread_with_message(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    tenant_admin_user: User,
    verified_applicant: CFPApplicant,
) -> MessageThread:
    """Create a thread with one message between admin and applicant."""
    thread = MessageThread(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        subject="Existing Thread",
    )
    db_session.add(thread)
    await db_session.flush()

    # Admin participant (already read)
    db_session.add(
        MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type="user",
            participant_id=tenant_admin_user.id,
            last_read_at=datetime.now(UTC) + timedelta(minutes=5),
        )
    )
    # Applicant participant (unread)
    db_session.add(
        MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type="applicant",
            participant_id=verified_applicant.id,
        )
    )

    # Initial message from admin
    db_session.add(
        Message(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=tenant_admin_user.id,
            body_html="<p>Hello from admin</p>",
        )
    )

    await db_session.commit()
    return thread


# ══════════════════════════════════════════════════════════════════════════
#  PORTAL AUTH TESTS
# ══════════════════════════════════════════════════════════════════════════


class TestPortalRegistration:
    """Tests for POST /portal/{tenant_slug}/register."""

    @pytest.mark.asyncio
    async def test_register_success(
        self,
        client: AsyncClient,
        tenant: Tenant,
    ):
        """Successful registration returns a success message."""
        response = await client.post(
            f"{PORTAL_BASE}/{tenant.slug}/register",
            json={
                "email": f"new-{uuid.uuid4().hex[:8]}@example.com",
                "password": "StrongPass1!",
                "first_name": "New",
                "last_name": "User",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Registration successful" in data["message"]

    @pytest.mark.asyncio
    async def test_register_duplicate_email(
        self,
        client: AsyncClient,
        tenant: Tenant,
        verified_applicant: CFPApplicant,
    ):
        """Registration with an existing email returns 409."""
        response = await client.post(
            f"{PORTAL_BASE}/{tenant.slug}/register",
            json={
                "email": verified_applicant.email,
                "password": "StrongPass1!",
                "first_name": "Dup",
                "last_name": "User",
            },
        )
        assert response.status_code == 409
        assert "already exists" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_register_weak_password(
        self,
        client: AsyncClient,
        tenant: Tenant,
    ):
        """Registration with a weak password returns 422."""
        response = await client.post(
            f"{PORTAL_BASE}/{tenant.slug}/register",
            json={
                "email": f"weak-{uuid.uuid4().hex[:8]}@example.com",
                "password": "weak",
                "first_name": "Weak",
                "last_name": "Pass",
            },
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_register_invalid_tenant_slug(
        self,
        client: AsyncClient,
    ):
        """Registration with a non-existent tenant slug returns 404."""
        response = await client.post(
            f"{PORTAL_BASE}/nonexistent-tenant/register",
            json={
                "email": "any@example.com",
                "password": "StrongPass1!",
                "first_name": "Any",
                "last_name": "User",
            },
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_register_missing_first_name(
        self,
        client: AsyncClient,
        tenant: Tenant,
    ):
        """Registration without first_name returns 422."""
        response = await client.post(
            f"{PORTAL_BASE}/{tenant.slug}/register",
            json={
                "email": "test@example.com",
                "password": "StrongPass1!",
            },
        )
        assert response.status_code == 422


class TestPortalLogin:
    """Tests for POST /portal/{tenant_slug}/login."""

    @pytest.mark.asyncio
    async def test_login_success(
        self,
        client: AsyncClient,
        tenant: Tenant,
        verified_applicant: CFPApplicant,
    ):
        """Successful login returns access and refresh tokens."""
        response = await client.post(
            f"{PORTAL_BASE}/{tenant.slug}/login",
            json={
                "email": verified_applicant.email,
                "password": "Password123!",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] > 0

    @pytest.mark.asyncio
    async def test_login_wrong_password(
        self,
        client: AsyncClient,
        tenant: Tenant,
        verified_applicant: CFPApplicant,
    ):
        """Login with wrong password returns 401."""
        response = await client.post(
            f"{PORTAL_BASE}/{tenant.slug}/login",
            json={
                "email": verified_applicant.email,
                "password": "WrongPassword1!",
            },
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_login_nonexistent_email(
        self,
        client: AsyncClient,
        tenant: Tenant,
    ):
        """Login with non-existent email returns 401."""
        response = await client.post(
            f"{PORTAL_BASE}/{tenant.slug}/login",
            json={
                "email": "nonexistent@example.com",
                "password": "Password123!",
            },
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_login_unverified_email(
        self,
        client: AsyncClient,
        tenant: Tenant,
        unverified_applicant: CFPApplicant,
    ):
        """Login with unverified email returns 403."""
        response = await client.post(
            f"{PORTAL_BASE}/{tenant.slug}/login",
            json={
                "email": unverified_applicant.email,
                "password": "Password123!",
            },
        )
        assert response.status_code == 403
        assert "not verified" in response.json()["detail"]

    @pytest.mark.asyncio
    async def test_login_invalid_tenant(
        self,
        client: AsyncClient,
    ):
        """Login with non-existent tenant returns 404."""
        response = await client.post(
            f"{PORTAL_BASE}/nonexistent-tenant/login",
            json={
                "email": "any@example.com",
                "password": "Password123!",
            },
        )
        assert response.status_code == 404


class TestPortalTokenRefresh:
    """Tests for POST /portal/{tenant_slug}/refresh."""

    @pytest.mark.asyncio
    async def test_refresh_success(
        self,
        client: AsyncClient,
        tenant: Tenant,
        verified_applicant: CFPApplicant,
        db_session: AsyncSession,
    ):
        """Refreshing with a valid refresh token returns new tokens."""
        # First, log in to get a valid refresh token
        login_resp = await client.post(
            f"{PORTAL_BASE}/{tenant.slug}/login",
            json={
                "email": verified_applicant.email,
                "password": "Password123!",
            },
        )
        assert login_resp.status_code == 200
        refresh_token = login_resp.json()["refresh_token"]

        # Refresh
        response = await client.post(
            f"{PORTAL_BASE}/{tenant.slug}/refresh",
            json={"refresh_token": refresh_token},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        # New refresh token should differ from original
        assert data["refresh_token"] != refresh_token

    @pytest.mark.asyncio
    async def test_refresh_with_invalid_token(
        self,
        client: AsyncClient,
        tenant: Tenant,
    ):
        """Refresh with an invalid token returns 401."""
        response = await client.post(
            f"{PORTAL_BASE}/{tenant.slug}/refresh",
            json={"refresh_token": "invalid-token"},
        )
        assert response.status_code == 401


class TestPortalForgotResetPassword:
    """Tests for forgot-password and reset-password flows."""

    @pytest.mark.asyncio
    async def test_forgot_password_existing_email(
        self,
        client: AsyncClient,
        tenant: Tenant,
        verified_applicant: CFPApplicant,
    ):
        """Forgot password always returns success (no email enumeration)."""
        response = await client.post(
            f"{PORTAL_BASE}/{tenant.slug}/forgot-password",
            json={"email": verified_applicant.email},
        )
        assert response.status_code == 200
        assert "message" in response.json()

    @pytest.mark.asyncio
    async def test_forgot_password_nonexistent_email(
        self,
        client: AsyncClient,
        tenant: Tenant,
    ):
        """Forgot password returns success even for non-existent email."""
        response = await client.post(
            f"{PORTAL_BASE}/{tenant.slug}/forgot-password",
            json={"email": "nonexistent@example.com"},
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_reset_password_with_valid_token(
        self,
        client: AsyncClient,
        tenant: Tenant,
        verified_applicant: CFPApplicant,
        db_session: AsyncSession,
    ):
        """Reset password with a valid token succeeds."""
        raw_token, token_hash_val = generate_email_verification_token()
        reset = ApplicantPasswordReset(
            applicant_id=verified_applicant.id,
            token_hash=token_hash_val,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        db_session.add(reset)
        await db_session.commit()

        response = await client.post(
            f"{PORTAL_BASE}/{tenant.slug}/reset-password",
            json={
                "token": raw_token,
                "new_password": "NewStrongPass1!",
            },
        )
        assert response.status_code == 200
        assert "reset successfully" in response.json()["message"]

    @pytest.mark.asyncio
    async def test_reset_password_with_invalid_token(
        self,
        client: AsyncClient,
        tenant: Tenant,
    ):
        """Reset password with an invalid token returns 400."""
        response = await client.post(
            f"{PORTAL_BASE}/{tenant.slug}/reset-password",
            json={
                "token": "invalid-reset-token",
                "new_password": "NewStrongPass1!",
            },
        )
        assert response.status_code == 400


class TestPortalProfile:
    """Tests for GET /portal/me and PUT /portal/me."""

    @pytest.mark.asyncio
    async def test_get_profile(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
    ):
        """GET /portal/me returns the applicant profile."""
        response = await client.get(
            f"{PORTAL_BASE}/me",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(verified_applicant.id)
        assert data["email"] == verified_applicant.email
        assert data["first_name"] == "Jane"
        assert data["last_name"] == "Speaker"

    @pytest.mark.asyncio
    async def test_get_profile_without_auth(
        self,
        client: AsyncClient,
    ):
        """GET /portal/me without auth returns 401."""
        response = await client.get(f"{PORTAL_BASE}/me")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_update_profile(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
    ):
        """PUT /portal/me updates the applicant profile."""
        response = await client.put(
            f"{PORTAL_BASE}/me",
            json={
                "first_name": "Updated",
                "company": "TestCorp",
                "bio": "Speaker bio text",
            },
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["first_name"] == "Updated"
        assert data["company"] == "TestCorp"
        assert data["bio"] == "Speaker bio text"

    @pytest.mark.asyncio
    async def test_update_profile_without_auth(
        self,
        client: AsyncClient,
    ):
        """PUT /portal/me without auth returns 401."""
        response = await client.put(
            f"{PORTAL_BASE}/me",
            json={"first_name": "Hacker"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_update_notifications_setting(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
    ):
        """Updating message_notifications_enabled via profile."""
        response = await client.put(
            f"{PORTAL_BASE}/me",
            json={"message_notifications_enabled": False},
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        assert response.json()["message_notifications_enabled"] is False


class TestPortalPublicEndpoints:
    """Tests for public portal endpoints (no auth)."""

    @pytest.mark.asyncio
    async def test_get_tenant_info(
        self,
        client: AsyncClient,
        tenant: Tenant,
    ):
        """GET /portal/tenant/{slug} returns tenant info."""
        response = await client.get(f"{PORTAL_BASE}/tenant/{tenant.slug}")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == tenant.name
        assert data["slug"] == tenant.slug

    @pytest.mark.asyncio
    async def test_get_tenant_info_not_found(
        self,
        client: AsyncClient,
    ):
        """GET /portal/tenant/{slug} with non-existent slug returns 404."""
        response = await client.get(f"{PORTAL_BASE}/tenant/nonexistent-slug")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_landing_page(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference: Conference,
    ):
        """GET /portal/{slug}/{abbreviation} returns landing page data."""
        response = await client.get(f"{PORTAL_BASE}/{tenant.slug}/{conference.abbreviation}")
        assert response.status_code == 200
        data = response.json()
        assert data["conference"]["name"] == conference.name
        assert data["tenant_name"] == tenant.name

    @pytest.mark.asyncio
    async def test_get_landing_page_bad_conference(
        self,
        client: AsyncClient,
        tenant: Tenant,
    ):
        """GET /portal/{slug}/{abbreviation} with bad abbreviation returns 404."""
        response = await client.get(f"{PORTAL_BASE}/{tenant.slug}/NONEXIST")
        assert response.status_code == 404


class TestPortalCommitteeMemberships:
    """Tests for GET /portal/me/committee-memberships."""

    @pytest.mark.asyncio
    async def test_list_committee_memberships_empty(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
    ):
        """Returns an empty list when applicant has no memberships."""
        response = await client.get(
            f"{PORTAL_BASE}/me/committee-memberships",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_list_committee_memberships_without_auth(
        self,
        client: AsyncClient,
    ):
        """GET /portal/me/committee-memberships without auth returns 401."""
        response = await client.get(f"{PORTAL_BASE}/me/committee-memberships")
        assert response.status_code == 401


# ══════════════════════════════════════════════════════════════════════════
#  PORTAL MESSAGING TESTS
# ══════════════════════════════════════════════════════════════════════════


class TestPortalCreateThread:
    """Tests for POST /portal/messages."""

    @pytest.mark.asyncio
    async def test_create_thread(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference: Conference,
        verified_applicant: CFPApplicant,
        applicant_token: str,
        tenant_admin_user: User,
        tenant_with_cfp_and_messaging: Tenant,
    ):
        """Applicant creates a new thread."""
        response = await client.post(
            f"{PORTAL_BASE}/messages",
            json={
                "conference_id": str(conference.id),
                "subject": "Question about CFP",
                "body_html": "<p>I have a question about the submission deadline.</p>",
            },
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 201
        data = response.json()
        assert data["subject"] == "Question about CFP"
        assert len(data["messages"]) == 1
        assert data["messages"][0]["body_html"] is not None
        # Applicant should be among participants
        participant_ids = [str(p["id"]) for p in data["participants"]]
        assert str(verified_applicant.id) in participant_ids

    @pytest.mark.asyncio
    async def test_create_thread_without_auth(
        self,
        client: AsyncClient,
        conference: Conference,
    ):
        """Creating a thread without auth returns 401."""
        response = await client.post(
            f"{PORTAL_BASE}/messages",
            json={
                "conference_id": str(conference.id),
                "subject": "Unauthorized",
                "body_html": "<p>Should fail</p>",
            },
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_create_thread_nonexistent_conference(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
    ):
        """Creating a thread with a non-existent conference returns 404."""
        response = await client.post(
            f"{PORTAL_BASE}/messages",
            json={
                "conference_id": str(uuid.uuid4()),
                "subject": "Bad conference",
                "body_html": "<p>Non-existent conference</p>",
            },
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 404


class TestPortalListThreads:
    """Tests for GET /portal/messages."""

    @pytest.mark.asyncio
    async def test_list_threads(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
    ):
        """List threads returns the applicant's threads."""
        response = await client.get(
            f"{PORTAL_BASE}/messages",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert len(data["items"]) >= 1
        # Check that our thread is in the list
        thread_ids = [item["id"] for item in data["items"]]
        assert str(thread_with_message.id) in thread_ids

    @pytest.mark.asyncio
    async def test_list_threads_empty(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
    ):
        """List threads returns empty when applicant has no threads."""
        response = await client.get(
            f"{PORTAL_BASE}/messages",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["items"] == []

    @pytest.mark.asyncio
    async def test_list_threads_without_auth(
        self,
        client: AsyncClient,
    ):
        """Listing threads without auth returns 401."""
        response = await client.get(f"{PORTAL_BASE}/messages")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_list_threads_pagination(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
    ):
        """Pagination params are respected."""
        response = await client.get(
            f"{PORTAL_BASE}/messages",
            params={"page": 1, "page_size": 1},
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 1
        assert data["page_size"] == 1

    @pytest.mark.asyncio
    async def test_list_threads_filter_by_conference(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
        conference: Conference,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
    ):
        """Filter threads by conference_id."""
        response = await client.get(
            f"{PORTAL_BASE}/messages",
            params={"conference_id": str(conference.id)},
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1


class TestPortalGetThread:
    """Tests for GET /portal/messages/{thread_id}."""

    @pytest.mark.asyncio
    async def test_get_thread_detail(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
    ):
        """Get thread detail returns thread with messages."""
        response = await client.get(
            f"{PORTAL_BASE}/messages/{thread_with_message.id}",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(thread_with_message.id)
        assert data["subject"] == "Existing Thread"
        assert len(data["messages"]) >= 1
        assert len(data["participants"]) >= 2
        # ``is_me`` is the contract the FE relies on for speech-bubble
        # styling and read-receipt filtering. The applicant participant
        # / sender is the logged-in user; admins are not.
        for p in data["participants"]:
            if p["type"] == "applicant" and p["id"] == str(verified_applicant.id):
                assert p["is_me"] is True
            else:
                assert p["is_me"] is False
        for m in data["messages"]:
            sender = m["sender"]
            expected = sender["type"] == "applicant" and sender["id"] == str(verified_applicant.id)
            assert sender["is_me"] is expected

    @pytest.mark.asyncio
    async def test_get_thread_not_participant(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference: Conference,
        db_session: AsyncSession,
        verified_applicant: CFPApplicant,
        applicant_token: str,
    ):
        """Getting a thread where applicant is not a participant returns 404."""
        # Create a thread without the applicant as participant
        other_thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            subject="Private Thread",
        )
        db_session.add(other_thread)
        await db_session.commit()

        response = await client.get(
            f"{PORTAL_BASE}/messages/{other_thread.id}",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_nonexistent_thread(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
    ):
        """Getting a non-existent thread returns 404."""
        response = await client.get(
            f"{PORTAL_BASE}/messages/{uuid.uuid4()}",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_thread_hides_internal_notes(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        db_session: AsyncSession,
    ):
        """Internal notes are not visible to the applicant."""
        thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            subject="Thread with Note",
        )
        db_session.add(thread)
        await db_session.flush()

        db_session.add(
            MessageParticipant(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                thread_id=thread.id,
                participant_type="applicant",
                participant_id=verified_applicant.id,
            )
        )

        # Visible message
        db_session.add(
            Message(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                thread_id=thread.id,
                sender_type="user",
                sender_id=tenant_admin_user.id,
                body_html="<p>Visible message</p>",
                is_internal_note=False,
            )
        )
        # Internal note (should be hidden)
        db_session.add(
            Message(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                thread_id=thread.id,
                sender_type="user",
                sender_id=tenant_admin_user.id,
                body_html="<p>Internal note for admins only</p>",
                is_internal_note=True,
            )
        )
        await db_session.commit()

        response = await client.get(
            f"{PORTAL_BASE}/messages/{thread.id}",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        # Only the visible message should be returned
        assert len(data["messages"]) == 1
        assert "Visible message" in data["messages"][0]["body_html"]


class TestPortalReplyToThread:
    """Tests for POST /portal/messages/{thread_id}/reply."""

    @pytest.mark.asyncio
    async def test_reply_to_thread(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
    ):
        """Applicant replies to an existing thread."""
        response = await client.post(
            f"{PORTAL_BASE}/messages/{thread_with_message.id}/reply",
            json={"body_html": "<p>Thank you for your message!</p>"},
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 201
        data = response.json()
        assert data["thread_id"] == str(thread_with_message.id)
        assert "Thank you" in data["body_html"]
        assert data["sender"]["type"] == "applicant"
        assert data["sender"]["id"] == str(verified_applicant.id)

    @pytest.mark.asyncio
    async def test_reply_without_auth(
        self,
        client: AsyncClient,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
        verified_applicant: CFPApplicant,
    ):
        """Replying without auth returns 401."""
        response = await client.post(
            f"{PORTAL_BASE}/messages/{thread_with_message.id}/reply",
            json={"body_html": "<p>Unauthorized</p>"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_reply_to_nonexistent_thread(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
    ):
        """Replying to a non-existent thread returns 404."""
        response = await client.post(
            f"{PORTAL_BASE}/messages/{uuid.uuid4()}/reply",
            json={"body_html": "<p>Orphan reply</p>"},
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 404


class TestPortalArchiveUnarchive:
    """Tests for POST /portal/messages/{thread_id}/archive and unarchive."""

    @pytest.mark.asyncio
    async def test_archive_thread(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
    ):
        """Archiving a thread sets archived_at."""
        response = await client.post(
            f"{PORTAL_BASE}/messages/{thread_with_message.id}/archive",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        assert response.json()["ok"] is True

    @pytest.mark.asyncio
    async def test_unarchive_thread(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
        db_session: AsyncSession,
    ):
        """Unarchiving a thread clears archived_at."""
        # First archive
        thread_with_message.archived_at = datetime.now(UTC)
        await db_session.commit()

        response = await client.post(
            f"{PORTAL_BASE}/messages/{thread_with_message.id}/unarchive",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        assert response.json()["ok"] is True

    @pytest.mark.asyncio
    async def test_archive_nonexistent_thread(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
    ):
        """Archiving a non-existent thread returns 404."""
        response = await client.post(
            f"{PORTAL_BASE}/messages/{uuid.uuid4()}/archive",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_archive_without_auth(
        self,
        client: AsyncClient,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
        verified_applicant: CFPApplicant,
    ):
        """Archiving without auth returns 401."""
        response = await client.post(
            f"{PORTAL_BASE}/messages/{thread_with_message.id}/archive",
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_list_archived_threads(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
    ):
        """Archived threads appear when archived=true filter is used."""
        # Archive the thread
        archive_resp = await client.post(
            f"{PORTAL_BASE}/messages/{thread_with_message.id}/archive",
            headers=auth_headers(applicant_token),
        )
        assert archive_resp.status_code == 200

        # List archived
        response = await client.get(
            f"{PORTAL_BASE}/messages",
            params={"archived": "true"},
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        thread_ids = [item["id"] for item in data["items"]]
        assert str(thread_with_message.id) in thread_ids

        # Archived thread should NOT appear in non-archived list
        response2 = await client.get(
            f"{PORTAL_BASE}/messages",
            headers=auth_headers(applicant_token),
        )
        assert response2.status_code == 200
        data2 = response2.json()
        thread_ids2 = [item["id"] for item in data2["items"]]
        assert str(thread_with_message.id) not in thread_ids2


class TestPortalMarkRead:
    """Tests for POST /portal/messages/{thread_id}/read."""

    @pytest.mark.asyncio
    async def test_mark_thread_read(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
    ):
        """Marking a thread as read returns ok."""
        response = await client.post(
            f"{PORTAL_BASE}/messages/{thread_with_message.id}/read",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        assert response.json()["ok"] is True

    @pytest.mark.asyncio
    async def test_mark_read_nonexistent_thread(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
    ):
        """Marking a non-existent thread as read still returns ok (graceful)."""
        response = await client.post(
            f"{PORTAL_BASE}/messages/{uuid.uuid4()}/read",
            headers=auth_headers(applicant_token),
        )
        # The endpoint returns ok even if participant is not found
        assert response.status_code == 200


class TestPortalUnreadCount:
    """Tests for GET /portal/messages/unread-count."""

    @pytest.mark.asyncio
    async def test_unread_count_with_unread_thread(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
    ):
        """Unread count reflects unread threads."""
        response = await client.get(
            f"{PORTAL_BASE}/messages/unread-count",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["unread_count"] >= 1

    @pytest.mark.asyncio
    async def test_unread_count_after_marking_read(
        self,
        client: AsyncClient,
        verified_applicant: CFPApplicant,
        applicant_token: str,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
    ):
        """Unread count decreases after marking thread as read."""
        # Mark the thread as read
        await client.post(
            f"{PORTAL_BASE}/messages/{thread_with_message.id}/read",
            headers=auth_headers(applicant_token),
        )

        response = await client.get(
            f"{PORTAL_BASE}/messages/unread-count",
            headers=auth_headers(applicant_token),
        )
        assert response.status_code == 200
        data = response.json()
        assert data["unread_count"] == 0

    @pytest.mark.asyncio
    async def test_unread_count_without_auth(
        self,
        client: AsyncClient,
    ):
        """Unread count without auth returns 401."""
        response = await client.get(f"{PORTAL_BASE}/messages/unread-count")
        assert response.status_code == 401


class TestPortalCrossTenantIsolation:
    """Tests ensuring applicants cannot access data from other tenants."""

    @pytest.mark.asyncio
    async def test_cannot_view_other_tenant_thread(
        self,
        client: AsyncClient,
        second_tenant: Tenant,
        other_tenant_applicant: CFPApplicant,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
        verified_applicant: CFPApplicant,
    ):
        """Applicant from a different tenant cannot view threads from another tenant."""
        # Create a token for the other-tenant applicant
        other_token = create_applicant_access_token(other_tenant_applicant.id, second_tenant.id)

        response = await client.get(
            f"{PORTAL_BASE}/messages/{thread_with_message.id}",
            headers=auth_headers(other_token),
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_reply_to_other_tenant_thread(
        self,
        client: AsyncClient,
        second_tenant: Tenant,
        other_tenant_applicant: CFPApplicant,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
        verified_applicant: CFPApplicant,
    ):
        """Applicant from a different tenant cannot reply to threads from another tenant."""
        other_token = create_applicant_access_token(other_tenant_applicant.id, second_tenant.id)

        response = await client.post(
            f"{PORTAL_BASE}/messages/{thread_with_message.id}/reply",
            json={"body_html": "<p>Cross-tenant intrusion</p>"},
            headers=auth_headers(other_token),
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_archive_other_tenant_thread(
        self,
        client: AsyncClient,
        second_tenant: Tenant,
        other_tenant_applicant: CFPApplicant,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
        verified_applicant: CFPApplicant,
    ):
        """Applicant from a different tenant cannot archive threads from another tenant."""
        other_token = create_applicant_access_token(other_tenant_applicant.id, second_tenant.id)

        response = await client.post(
            f"{PORTAL_BASE}/messages/{thread_with_message.id}/archive",
            headers=auth_headers(other_token),
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_other_tenant_threads_not_in_list(
        self,
        client: AsyncClient,
        second_tenant: Tenant,
        other_tenant_applicant: CFPApplicant,
        thread_with_message: MessageThread,
        tenant_admin_user: User,
        verified_applicant: CFPApplicant,
    ):
        """Threads from another tenant do not appear in the applicant's list."""
        other_token = create_applicant_access_token(other_tenant_applicant.id, second_tenant.id)

        response = await client.get(
            f"{PORTAL_BASE}/messages",
            headers=auth_headers(other_token),
        )
        assert response.status_code == 200
        data = response.json()
        thread_ids = [item["id"] for item in data["items"]]
        assert str(thread_with_message.id) not in thread_ids
