"""Tests: user address fields (street/city/postal/country) round-trip via PUT."""

import pytest
from httpx import AsyncClient

from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

BASE_URL = "/api/v1/users"

USER_PAYLOAD = {
    "email": "addr-test@example.com",
    "password": "StrongPass1",
    "first_name": "Addr",
    "last_name": "Test",
    "role": "user",
}


async def _create_user(client: AsyncClient, token: str) -> str:
    resp = await client.post(BASE_URL, json=USER_PAYLOAD, headers=auth_headers(token))
    assert resp.status_code == 201
    return resp.json()["id"]


async def test_update_user_address_fields_persist(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """PUT address fields → response + fresh GET both reflect the new values."""
    user_id = await _create_user(client, tenant_admin_token)

    patch_resp = await client.put(
        f"{BASE_URL}/{user_id}",
        json={
            "address_line_1": "123 Test Street",
            "city": "London",
            "postal_code": "W1A 1AA",
            "country": "GB",
        },
        headers=auth_headers(tenant_admin_token),
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data.get("address_line_1") == "123 Test Street"
    assert data.get("city") == "London"
    assert data.get("postal_code") == "W1A 1AA"
    assert data.get("country") == "GB"

    get_resp = await client.get(f"{BASE_URL}/{user_id}", headers=auth_headers(tenant_admin_token))
    assert get_resp.status_code == 200
    fresh = get_resp.json()
    assert fresh.get("address_line_1") == "123 Test Street"
    assert fresh.get("city") == "London"
    assert fresh.get("postal_code") == "W1A 1AA"
    assert fresh.get("country") == "GB"


async def test_partial_address_update_does_not_clear_other_fields(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Updating only city leaves other address fields unchanged."""
    user_id = await _create_user(client, tenant_admin_token)

    await client.put(
        f"{BASE_URL}/{user_id}",
        json={"address_line_1": "10 Downing St", "city": "London", "postal_code": "SW1A 2AA", "country": "GB"},
        headers=auth_headers(tenant_admin_token),
    )

    resp = await client.put(
        f"{BASE_URL}/{user_id}",
        json={"city": "Manchester"},
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("city") == "Manchester"
    assert data.get("address_line_1") == "10 Downing St"
    assert data.get("postal_code") == "SW1A 2AA"
    assert data.get("country") == "GB"
