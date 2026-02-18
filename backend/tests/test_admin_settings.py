"""Integration tests for the admin settings (platform currencies) endpoints."""

from httpx import AsyncClient

from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers


BASE_URL = "/api/v1/admin/settings"

CURRENCY_PAYLOAD = {
    "code": "USD",
    "name": "US Dollar",
    "symbol": "$",
    "is_active": True,
}


# ── List currencies ───────────────────────────────────────────────────


async def test_list_currencies(
    client: AsyncClient,
    super_admin_user: User,
    super_admin_token: str,
) -> None:
    """Super admin can list platform currencies (empty initially)."""
    response = await client.get(
        f"{BASE_URL}/currencies",
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert data["page"] == 1


# ── Create currency ───────────────────────────────────────────────────


async def test_create_currency(
    client: AsyncClient,
    super_admin_user: User,
    super_admin_token: str,
) -> None:
    """Super admin can create a platform currency and receives 201."""
    response = await client.post(
        f"{BASE_URL}/currencies",
        json=CURRENCY_PAYLOAD,
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["code"] == CURRENCY_PAYLOAD["code"]
    assert data["name"] == CURRENCY_PAYLOAD["name"]
    assert data["symbol"] == CURRENCY_PAYLOAD["symbol"]
    assert data["is_active"] is True
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


# ── Update currency ───────────────────────────────────────────────────


async def test_update_currency(
    client: AsyncClient,
    super_admin_user: User,
    super_admin_token: str,
) -> None:
    """Super admin can update a platform currency."""
    # Create first
    create_resp = await client.post(
        f"{BASE_URL}/currencies",
        json=CURRENCY_PAYLOAD,
        headers=auth_headers(super_admin_token),
    )
    assert create_resp.status_code == 201
    currency_id = create_resp.json()["id"]

    # Update name and symbol
    response = await client.put(
        f"{BASE_URL}/currencies/{currency_id}",
        json={"name": "Updated Dollar", "symbol": "US$"},
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Dollar"
    assert data["symbol"] == "US$"
    # Code should remain unchanged
    assert data["code"] == CURRENCY_PAYLOAD["code"]


# ── Delete currency ───────────────────────────────────────────────────


async def test_delete_currency(
    client: AsyncClient,
    super_admin_user: User,
    super_admin_token: str,
) -> None:
    """Super admin can delete a platform currency (204 No Content)."""
    # Create first
    create_resp = await client.post(
        f"{BASE_URL}/currencies",
        json=CURRENCY_PAYLOAD,
        headers=auth_headers(super_admin_token),
    )
    assert create_resp.status_code == 201
    currency_id = create_resp.json()["id"]

    # Delete
    response = await client.delete(
        f"{BASE_URL}/currencies/{currency_id}",
        headers=auth_headers(super_admin_token),
    )
    assert response.status_code == 204


# ── Forbidden for non-super-admin ─────────────────────────────────────


async def test_currencies_forbidden_for_non_super_admin(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin (non-super-admin) gets 403 when trying to create a currency."""
    response = await client.post(
        f"{BASE_URL}/currencies",
        json=CURRENCY_PAYLOAD,
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 403
