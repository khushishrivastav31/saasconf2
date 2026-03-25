"""Tests for training policies settings API."""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified


@pytest_asyncio.fixture
async def policies_tenant(db_session: AsyncSession, tenant):
    """Tenant with some training policies pre-configured."""
    tenant.settings = {
        **(tenant.settings or {}),
        "training_policies": {
            "privacy_policy": {
                "type": "url",
                "url": "https://example.com/privacy",
                "content": None,
                "enabled": True,
            },
            "terms_and_conditions": {
                "type": "content",
                "content": "<p>Our terms</p>",
                "url": None,
                "enabled": True,
            },
            "code_of_conduct": {
                "type": "url",
                "url": "https://example.com/coc",
                "content": None,
                "enabled": False,
            },
        },
    }
    flag_modified(tenant, "settings")
    await db_session.commit()
    await db_session.refresh(tenant)
    return tenant


@pytest.mark.asyncio
async def test_get_training_policies_default(client: AsyncClient, tenant_admin_token):
    """GET training policies returns defaults when none configured."""
    resp = await client.get(
        "/api/v1/trainings/policies",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["privacy_policy"]["enabled"] is False
    assert data["privacy_policy"]["type"] is None
    assert data["terms_and_conditions"]["enabled"] is False
    assert data["code_of_conduct"]["enabled"] is False
    assert data["cookies_policy"]["enabled"] is False
    assert data["imprint"]["enabled"] is False


@pytest.mark.asyncio
async def test_get_training_policies_configured(
    client: AsyncClient, policies_tenant, tenant_admin_token
):
    """GET training policies returns configured values."""
    resp = await client.get(
        "/api/v1/trainings/policies",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["privacy_policy"]["enabled"] is True
    assert data["privacy_policy"]["type"] == "url"
    assert data["privacy_policy"]["url"] == "https://example.com/privacy"
    assert data["terms_and_conditions"]["enabled"] is True
    assert data["terms_and_conditions"]["type"] == "content"
    assert "<p>Our terms</p>" in data["terms_and_conditions"]["content"]
    # Disabled policy still returned
    assert data["code_of_conduct"]["enabled"] is False


@pytest.mark.asyncio
async def test_update_training_policies(client: AsyncClient, tenant_admin_token):
    """PUT training policies saves URL-type policy correctly."""
    resp = await client.put(
        "/api/v1/trainings/policies",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
        json={
            "privacy_policy": {
                "type": "url",
                "url": "https://example.com/new-privacy",
                "enabled": True,
            },
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["privacy_policy"]["enabled"] is True
    assert data["privacy_policy"]["url"] == "https://example.com/new-privacy"
    # Other policies remain default
    assert data["terms_and_conditions"]["enabled"] is False


@pytest.mark.asyncio
async def test_update_training_content_policy(client: AsyncClient, tenant_admin_token):
    """PUT training policies saves content-type with HTML sanitization."""
    resp = await client.put(
        "/api/v1/trainings/policies",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
        json={
            "code_of_conduct": {
                "type": "content",
                "content": "<p>Be kind</p><script>alert('xss')</script>",
                "enabled": True,
            },
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["code_of_conduct"]["enabled"] is True
    assert data["code_of_conduct"]["type"] == "content"
    assert "<script>" not in data["code_of_conduct"]["content"]
    assert "Be kind" in data["code_of_conduct"]["content"]


@pytest.mark.asyncio
async def test_update_training_invalid_url(client: AsyncClient, tenant_admin_token):
    """PUT training policies rejects invalid URLs."""
    resp = await client.put(
        "/api/v1/trainings/policies",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
        json={
            "imprint": {
                "type": "url",
                "url": "not-a-valid-url",
                "enabled": True,
            },
        },
    )
    assert resp.status_code == 400
    assert "Invalid URL" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_partial_update_preserves_existing(
    client: AsyncClient, policies_tenant, tenant_admin_token
):
    """PUT training policies only updates provided entries, preserving others."""
    resp = await client.put(
        "/api/v1/trainings/policies",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
        json={
            "imprint": {
                "type": "url",
                "url": "https://example.com/imprint",
                "enabled": True,
            },
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    # New entry saved
    assert data["imprint"]["enabled"] is True
    assert data["imprint"]["url"] == "https://example.com/imprint"
    # Existing entry preserved
    assert data["privacy_policy"]["enabled"] is True
    assert data["privacy_policy"]["url"] == "https://example.com/privacy"


@pytest.mark.asyncio
async def test_requires_admin_access(client: AsyncClient, regular_user_token):
    """PUT training policies requires tenant admin access."""
    resp = await client.put(
        "/api/v1/trainings/policies",
        headers={"Authorization": f"Bearer {regular_user_token}"},
        json={
            "privacy_policy": {
                "type": "url",
                "url": "https://example.com/privacy",
                "enabled": True,
            },
        },
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_cookies_policy(client: AsyncClient, tenant_admin_token):
    """PUT training policies supports cookies_policy type."""
    resp = await client.put(
        "/api/v1/trainings/policies",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
        json={
            "cookies_policy": {
                "type": "url",
                "url": "https://example.com/cookies",
                "enabled": True,
            },
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["cookies_policy"]["enabled"] is True
    assert data["cookies_policy"]["url"] == "https://example.com/cookies"
