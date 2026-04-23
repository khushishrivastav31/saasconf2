"""Integration tests for the auth API endpoints."""

import uuid
from datetime import timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import generate_email_verification_token
from app.core.security import hash_password, verify_password
from app.core.utils import utcnow
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.user_password_reset import UserPasswordReset
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


async def test_login_deactivated_user(client: AsyncClient, db_session: AsyncSession, tenant: Tenant) -> None:
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


async def test_me_returns_user_info(client: AsyncClient, tenant_admin_user: User, tenant_admin_token: str) -> None:
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


async def test_logout_success(client: AsyncClient, tenant_admin_token: str) -> None:
    """POST /logout returns success message with a valid token."""
    response = await client.post(
        "/api/v1/auth/logout",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "Successfully logged out"


# ── Refresh tests ────────────────────────────────────────────────────────


async def test_refresh_returns_new_tokens(client: AsyncClient, tenant_admin_user: User) -> None:
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


# ── Forgot Password tests ────────────────────────────────────────────────


async def test_forgot_password_existing_user(client: AsyncClient, tenant_admin_user: User) -> None:
    """POST /forgot-password with existing email returns success message."""
    response = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": tenant_admin_user.email},
    )
    assert response.status_code == 200
    data = response.json()
    assert "password reset link" in data["message"].lower()


async def test_forgot_password_nonexistent_email(client: AsyncClient) -> None:
    """POST /forgot-password with non-existent email still returns success (no enumeration)."""
    response = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "nobody@nowhere.com"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "password reset link" in data["message"].lower()


async def test_forgot_password_invalid_email_format(client: AsyncClient) -> None:
    """POST /forgot-password with invalid email format returns 422."""
    response = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "not-an-email"},
    )
    assert response.status_code == 422


async def test_forgot_password_deactivated_user(client: AsyncClient, db_session: AsyncSession, tenant: Tenant) -> None:
    """POST /forgot-password for deactivated user returns success but sends no email."""
    inactive_user = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"inactive-fp-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Inactive",
        last_name="User",
        role=UserRole.USER.value,
        is_active=False,
    )
    db_session.add(inactive_user)
    await db_session.commit()

    response = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": inactive_user.email},
    )
    assert response.status_code == 200


# ── Reset Password tests ────────────────────────────────────────────────


async def test_reset_password_valid_token(
    client: AsyncClient, db_session: AsyncSession, tenant_admin_user: User
) -> None:
    """POST /reset-password with a valid token changes the password."""
    # Create a reset token directly
    raw_token, token_hash = generate_email_verification_token()
    reset = UserPasswordReset(
        user_id=tenant_admin_user.id,
        token_hash=token_hash,
        expires_at=utcnow() + timedelta(hours=1),
    )
    db_session.add(reset)
    await db_session.commit()

    new_password = "NewSecurePassword456!"
    response = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": new_password},
    )
    assert response.status_code == 200
    assert "successfully" in response.json()["message"].lower()

    # Verify the new password works
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"email": tenant_admin_user.email, "password": new_password},
    )
    assert login_response.status_code == 200


async def test_reset_password_expired_token(
    client: AsyncClient, db_session: AsyncSession, tenant_admin_user: User
) -> None:
    """POST /reset-password with an expired token returns 401."""
    raw_token, token_hash = generate_email_verification_token()
    reset = UserPasswordReset(
        user_id=tenant_admin_user.id,
        token_hash=token_hash,
        expires_at=utcnow() - timedelta(hours=1),  # Already expired
    )
    db_session.add(reset)
    await db_session.commit()

    response = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "NewPassword123!"},
    )
    assert response.status_code == 401


async def test_reset_password_used_token(
    client: AsyncClient, db_session: AsyncSession, tenant_admin_user: User
) -> None:
    """POST /reset-password with an already-used token returns 401."""
    raw_token, token_hash = generate_email_verification_token()
    reset = UserPasswordReset(
        user_id=tenant_admin_user.id,
        token_hash=token_hash,
        expires_at=utcnow() + timedelta(hours=1),
        used_at=utcnow(),  # Already used
    )
    db_session.add(reset)
    await db_session.commit()

    response = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "NewPassword123!"},
    )
    assert response.status_code == 401


async def test_reset_password_invalid_token(client: AsyncClient) -> None:
    """POST /reset-password with a completely invalid token returns 401."""
    response = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": "totally-fake-token", "new_password": "NewPassword123!"},
    )
    assert response.status_code == 401


async def test_reset_password_short_password(
    client: AsyncClient, db_session: AsyncSession, tenant_admin_user: User
) -> None:
    """POST /reset-password with a password shorter than 8 chars returns 422."""
    raw_token, token_hash = generate_email_verification_token()
    reset = UserPasswordReset(
        user_id=tenant_admin_user.id,
        token_hash=token_hash,
        expires_at=utcnow() + timedelta(hours=1),
    )
    db_session.add(reset)
    await db_session.commit()

    response = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "short"},
    )
    assert response.status_code == 422


# ── Change password tests ────────────────────────────────────────────────


async def test_change_password_success(
    client: AsyncClient, tenant_admin_user: User, tenant_admin_token: str, db_session: AsyncSession
) -> None:
    """Successfully change password with correct current password."""
    response = await client.patch(
        "/api/v1/auth/me/password",
        json={"current_password": "Password123!", "new_password": "NewPassword456!"},
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Password changed successfully"

    # Verify the password was actually changed
    await db_session.refresh(tenant_admin_user)
    assert verify_password("NewPassword456!", tenant_admin_user.password_hash)


async def test_change_password_wrong_current(client: AsyncClient, tenant_admin_token: str) -> None:
    """Reject change when current password is wrong."""
    response = await client.patch(
        "/api/v1/auth/me/password",
        json={"current_password": "WrongPassword!", "new_password": "NewPassword456!"},
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 401


async def test_change_password_same_as_current(client: AsyncClient, tenant_admin_token: str) -> None:
    """Reject change when new password is the same as current."""
    response = await client.patch(
        "/api/v1/auth/me/password",
        json={"current_password": "Password123!", "new_password": "Password123!"},
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 401


async def test_change_password_weak_new_password(client: AsyncClient, tenant_admin_token: str) -> None:
    """Reject change when new password is too weak (no uppercase)."""
    response = await client.patch(
        "/api/v1/auth/me/password",
        json={"current_password": "Password123!", "new_password": "weakpassword1"},
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 422


async def test_change_password_unauthenticated(client: AsyncClient) -> None:
    """Reject change when not authenticated."""
    response = await client.patch(
        "/api/v1/auth/me/password",
        json={"current_password": "Password123!", "new_password": "NewPassword456!"},
    )
    assert response.status_code == 401
