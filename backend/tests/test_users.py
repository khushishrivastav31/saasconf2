"""Integration tests for the user management API endpoints."""

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
