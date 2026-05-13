"""Integration tests for the user management API endpoints."""

import uuid

import pytest
from httpx import AsyncClient

from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

BASE_URL = "/api/v1/users"

USER_PAYLOAD = {
    "email": "newuser@example.com",
    "password": "StrongPass1",
    "first_name": "New",
    "last_name": "User",
    "role": "user",
}


# ── List tenant users ─────────────────────────────────────────────────


async def test_list_tenant_users(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin listing users returns at least the admin themselves."""
    response = await client.get(
        BASE_URL,
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    assert data["page"] == 1
    emails = [u["email"] for u in data["items"]]
    assert tenant_admin_user.email in emails


# ── Create user ────────────────────────────────────────────────────────


async def test_create_user(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can create a new user and receives 201."""
    response = await client.post(
        BASE_URL,
        json=USER_PAYLOAD,
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == USER_PAYLOAD["email"]
    assert data["first_name"] == USER_PAYLOAD["first_name"]
    assert data["last_name"] == USER_PAYLOAD["last_name"]
    assert data["role"] == "user"
    assert data["is_active"] is True
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


# ── Get user by ID ────────────────────────────────────────────────────


async def test_get_user_by_id(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can fetch a user by ID."""
    # Create a user first
    create_resp = await client.post(
        BASE_URL,
        json=USER_PAYLOAD,
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 201
    user_id = create_resp.json()["id"]

    # Fetch by ID
    response = await client.get(
        f"{BASE_URL}/{user_id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == user_id
    assert data["email"] == USER_PAYLOAD["email"]


# ── Update user ────────────────────────────────────────────────────────


async def test_update_user(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can update a user's first and last name."""
    # Create a user first
    create_resp = await client.post(
        BASE_URL,
        json=USER_PAYLOAD,
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 201
    user_id = create_resp.json()["id"]

    # Update
    response = await client.put(
        f"{BASE_URL}/{user_id}",
        json={"first_name": "Updated", "last_name": "Name"},
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["first_name"] == "Updated"
    assert data["last_name"] == "Name"
    # Email should not change
    assert data["email"] == USER_PAYLOAD["email"]


async def test_update_user_self_edit_rejected(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Admins cannot modify their own record via the admin endpoint (QA 0.5.1.8).

    The role + is_active fields feed back into the requester's own permission
    checks, so self-edit through this endpoint is a footgun (could lock the
    admin out of their own tenant or quietly demote them).
    """
    response = await client.put(
        f"{BASE_URL}/{tenant_admin_user.id}",
        json={"first_name": "SelfEdit"},
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 400
    assert "own" in response.json()["detail"].lower()


# ── Deactivate user ───────────────────────────────────────────────────


async def test_deactivate_user(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can deactivate (soft-delete) a user."""
    # Create a user first
    create_resp = await client.post(
        BASE_URL,
        json=USER_PAYLOAD,
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 201
    user_id = create_resp.json()["id"]

    # Deactivate
    response = await client.delete(
        f"{BASE_URL}/{user_id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert "deactivated" in data["message"].lower()

    # Verify the user is now inactive
    get_resp = await client.get(
        f"{BASE_URL}/{user_id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["is_active"] is False


# ── Forbidden for non-admin ───────────────────────────────────────────


async def test_users_forbidden_for_non_admin(
    client: AsyncClient,
    tenant: Tenant,
    regular_user: User,
    regular_user_token: str,
) -> None:
    """Regular user (non-admin) gets 403 when trying to list users."""
    response = await client.get(
        BASE_URL,
        headers=auth_headers(regular_user_token),
    )
    assert response.status_code == 403


# ── Create user without password (invite flow) ──────────────────────────


async def test_create_user_without_password(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Creating a user without a password succeeds and sends an invite."""
    payload = {
        "email": f"invited-{uuid.uuid4().hex[:8]}@example.com",
        "first_name": "Invited",
        "last_name": "User",
        "role": "user",
    }
    response = await client.post(
        BASE_URL,
        json=payload,
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == payload["email"]
    assert data["first_name"] == payload["first_name"]
    assert data["last_name"] == payload["last_name"]
    assert data["role"] == "user"
    assert data["is_active"] is True
    assert "id" in data
    assert data["last_login"] is None


# ── Unlock login (clear failed-attempt counter) ─────────────────────────


@pytest.mark.asyncio
async def test_unlock_login_no_attempts(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Unlocking a user with no failed attempts is a no-op that reports was_locked=false."""
    create_resp = await client.post(
        BASE_URL,
        json={**USER_PAYLOAD, "email": f"nolock-{uuid.uuid4().hex[:8]}@example.com"},
        headers=auth_headers(tenant_admin_token),
    )
    user_id = create_resp.json()["id"]

    response = await client.post(
        f"{BASE_URL}/{user_id}/unlock-login",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["was_locked"] is False
    assert body["attempts_cleared"] == 0


@pytest.mark.asyncio
async def test_unlock_login_clears_lockout(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Recording 5+ failed logins locks the account; unlock clears it."""
    from app.core.security.token_blacklist import _redis as _redis_check  # type: ignore[attr-defined]
    from app.core.security.token_blacklist import (
        is_account_locked,
        record_failed_login,
    )

    if _redis_check is None:
        pytest.skip("Redis not available")

    email = f"lockme-{uuid.uuid4().hex[:8]}@example.com"
    create_resp = await client.post(
        BASE_URL,
        json={**USER_PAYLOAD, "email": email, "password": "StrongPass1"},
        headers=auth_headers(tenant_admin_token),
    )
    user_id = create_resp.json()["id"]

    for _ in range(5):
        await record_failed_login(email)
    assert await is_account_locked(email) is True

    response = await client.post(
        f"{BASE_URL}/{user_id}/unlock-login",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["was_locked"] is True
    assert body["attempts_cleared"] == 5
    assert await is_account_locked(email) is False


@pytest.mark.asyncio
async def test_unlock_login_forbidden_for_non_admin(
    client: AsyncClient,
    tenant: Tenant,
    regular_user: User,
    regular_user_token: str,
) -> None:
    """Regular users can't unlock other users."""
    response = await client.post(
        f"{BASE_URL}/{regular_user.id}/unlock-login",
        headers=auth_headers(regular_user_token),
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_unlock_login_writes_audit_log_with_details(
    client: AsyncClient,
    db_session,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """The unlock endpoint writes a USER_UNLOCK_LOGIN audit-log row carrying
    attempts_cleared + was_locked in details, so the audit trail can answer
    "which admin lifted which lock and when"."""
    from sqlalchemy import select

    from app.core.security.token_blacklist import (
        _redis as _redis_check,  # type: ignore[attr-defined]
    )
    from app.core.security.token_blacklist import (
        record_failed_login,
    )
    from app.models.audit import AuditAction, AuditLog

    if _redis_check is None:
        pytest.skip("Redis not available")

    email = f"audited-{uuid.uuid4().hex[:8]}@example.com"
    create_resp = await client.post(
        BASE_URL,
        json={**USER_PAYLOAD, "email": email, "password": "StrongPass1"},
        headers=auth_headers(tenant_admin_token),
    )
    user_id = create_resp.json()["id"]

    for _ in range(5):
        await record_failed_login(email)

    response = await client.post(
        f"{BASE_URL}/{user_id}/unlock-login",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200

    rows = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    AuditLog.action == AuditAction.USER_UNLOCK_LOGIN,
                    AuditLog.resource_id == uuid.UUID(user_id),
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(rows) == 1
    audit = rows[0]
    assert audit.tenant_id == tenant_admin_user.tenant_id
    assert audit.user_id == tenant_admin_user.id
    assert audit.details["attempts_cleared"] == 5
    assert audit.details["was_locked"] is True
    assert audit.details["email"] == email


@pytest.mark.asyncio
async def test_unlock_login_cross_tenant_returns_404(
    client: AsyncClient,
    db_session,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """A tenant admin cannot unlock a user from another tenant — the API
    returns 404 (not 403) so the caller can't probe for cross-tenant user IDs."""
    from app.core.security import hash_password

    other_tenant = Tenant(
        id=uuid.uuid4(),
        name="Other Tenant",
        slug=f"other-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db_session.add(other_tenant)
    await db_session.flush()

    other_user = User(
        id=uuid.uuid4(),
        tenant_id=other_tenant.id,
        email=f"victim-{uuid.uuid4().hex[:8]}@other.test",
        password_hash=hash_password("Password123!"),
        first_name="Cross",
        last_name="Tenant",
        role="user",
        is_active=True,
    )
    db_session.add(other_user)
    await db_session.commit()

    response = await client.post(
        f"{BASE_URL}/{other_user.id}/unlock-login",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 404


# ── Resend invite ────────────────────────────────────────────────────────


async def test_resend_invite(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Resending an invite for a user who has never logged in succeeds."""
    # Create user without password (invite flow)
    payload = {
        "email": f"resend-{uuid.uuid4().hex[:8]}@example.com",
        "first_name": "Resend",
        "last_name": "Target",
        "role": "user",
    }
    create_resp = await client.post(
        BASE_URL,
        json=payload,
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 201
    user_id = create_resp.json()["id"]

    # Resend invite
    response = await client.post(
        f"{BASE_URL}/{user_id}/resend-invite",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert "resent" in data["message"].lower()


# ── Resend invite for nonexistent user ───────────────────────────────────


async def test_resend_invite_nonexistent_user(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Resending an invite for a nonexistent user returns 404."""
    fake_id = uuid.uuid4()
    response = await client.post(
        f"{BASE_URL}/{fake_id}/resend-invite",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 404


# ── Resend invite forbidden for non-admin ────────────────────────────────


async def test_resend_invite_forbidden_for_non_admin(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
    regular_user: User,
    regular_user_token: str,
) -> None:
    """Regular user gets 403 when trying to resend an invite."""
    # Create a user as admin first
    payload = {
        "email": f"noadmin-{uuid.uuid4().hex[:8]}@example.com",
        "first_name": "NoAdmin",
        "last_name": "Test",
        "role": "user",
    }
    create_resp = await client.post(
        BASE_URL,
        json=payload,
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 201
    user_id = create_resp.json()["id"]

    # Regular user tries to resend invite
    response = await client.post(
        f"{BASE_URL}/{user_id}/resend-invite",
        headers=auth_headers(regular_user_token),
    )
    assert response.status_code == 403
