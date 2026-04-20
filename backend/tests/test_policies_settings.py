"""Tests for conference policies settings API."""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest_asyncio.fixture
async def policies_conference(db_session: AsyncSession, conference):
    """Conference with some policies pre-configured."""
    conference.settings = {
        **(conference.settings or {}),
        "policies": {
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
    from sqlalchemy.orm.attributes import flag_modified

    flag_modified(conference, "settings")
    await db_session.commit()
    await db_session.refresh(conference)
    return conference


@pytest.mark.asyncio
async def test_get_policies_default(client: AsyncClient, conference, tenant_admin_token):
    """GET policies returns defaults when none configured."""
    resp = await client.get(
        f"/api/v1/conferences/{conference.id}/settings/policies",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["privacy_policy"]["enabled"] is False
    assert data["privacy_policy"]["type"] is None
    assert data["terms_and_conditions"]["enabled"] is False
    assert data["code_of_conduct"]["enabled"] is False


@pytest.mark.asyncio
async def test_get_policies_configured(client: AsyncClient, policies_conference, tenant_admin_token):
    """GET policies returns configured values."""
    resp = await client.get(
        f"/api/v1/conferences/{policies_conference.id}/settings/policies",
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
    # Disabled policy still returned (admin needs to see it)
    assert data["code_of_conduct"]["enabled"] is False


@pytest.mark.asyncio
async def test_update_policies(client: AsyncClient, conference, tenant_admin_token):
    """PUT policies saves URL-type policy correctly."""
    resp = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/policies",
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
async def test_update_content_policy(client: AsyncClient, conference, tenant_admin_token):
    """PUT policies saves content-type with HTML sanitization."""
    resp = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/policies",
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
    # Script tag should be sanitized
    assert "<script>" not in data["code_of_conduct"]["content"]
    assert "Be kind" in data["code_of_conduct"]["content"]


@pytest.mark.asyncio
async def test_update_invalid_url(client: AsyncClient, conference, tenant_admin_token):
    """PUT policies rejects invalid URLs."""
    resp = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/policies",
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
async def test_partial_update_preserves_existing(client: AsyncClient, policies_conference, tenant_admin_token):
    """PUT policies only updates provided entries, preserving others."""
    resp = await client.put(
        f"/api/v1/conferences/{policies_conference.id}/settings/policies",
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
async def test_requires_admin_access(client: AsyncClient, conference, regular_user_token):
    """PUT policies requires admin access."""
    resp = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/policies",
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
