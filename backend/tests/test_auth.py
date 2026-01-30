"""Integration tests for the auth API endpoints."""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import auth_headers


# ── Login tests ──────────────────────────────────────────────────────────


async def test_login_success(client: AsyncClient, tenant_admin_user: User) -> None:
    """Successful login returns access and refresh tokens."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": tenant_admin_user.email, "password": "Password123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert isinstance(data["expires_in"], int)
    assert data["expires_in"] > 0


async def test_login_wrong_password(client: AsyncClient, tenant_admin_user: User) -> None:
    """Login with wrong password returns 401."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": tenant_admin_user.email, "password": "WrongPassword999!"},
    )
    assert response.status_code == 401


async def test_login_nonexistent_email(client: AsyncClient) -> None:
    """Login with non-existent email returns 401."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@nowhere.com", "password": "Password123!"},
    )
    assert response.status_code == 401


async def test_login_deactivated_user(
    client: AsyncClient, db_session: AsyncSession, tenant: Tenant
) -> None:
    """Login with a deactivated user returns 401."""
    inactive_user = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"inactive-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Inactive",
        last_name="User",
        role=UserRole.USER.value,
        is_active=False,
    )
    db_session.add(inactive_user)
    await db_session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": inactive_user.email, "password": "Password123!"},
    )
    assert response.status_code == 401


# ── Me tests ─────────────────────────────────────────────────────────────


async def test_me_returns_user_info(
    client: AsyncClient, tenant_admin_user: User, tenant_admin_token: str
) -> None:
    """GET /me returns current user info with a valid token."""
    response = await client.get(
        "/api/v1/auth/me",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == tenant_admin_user.email
    assert data["first_name"] == tenant_admin_user.first_name
    assert data["last_name"] == tenant_admin_user.last_name
    assert data["role"] == tenant_admin_user.role
    assert data["is_active"] is True


async def test_me_without_token(client: AsyncClient) -> None:
    """GET /me without token returns 401."""
    response = await client.get("/api/v1/auth/me")
    assert response.status_code == 401


# ── Logout tests ─────────────────────────────────────────────────────────


async def test_logout_success(
    client: AsyncClient, tenant_admin_token: str
) -> None:
    """POST /logout returns success message with a valid token."""
    response = await client.post(
        "/api/v1/auth/logout",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Successfully logged out"


# ── Refresh tests ────────────────────────────────────────────────────────


async def test_refresh_returns_new_tokens(
    client: AsyncClient, tenant_admin_user: User
) -> None:
    """POST /refresh returns new tokens with a valid refresh token."""
    # First, login to obtain a refresh token
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": tenant_admin_user.email, "password": "Password123!"},
    )
    assert login_response.status_code == 200
    refresh_token = login_response.json()["refresh_token"]

    # Now use the refresh token to get new tokens
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert isinstance(data["expires_in"], int)
    assert data["expires_in"] > 0
    # The new refresh token should differ from the original (rotation)
    assert data["refresh_token"] != refresh_token
