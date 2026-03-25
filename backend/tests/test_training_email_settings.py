"""Tests for training email settings and templates API."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_email_settings_default(client: AsyncClient, tenant_admin_token):
    """GET returns defaults when none configured."""
    resp = await client.get(
        "/api/v1/trainings/email-settings",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email_sending_enabled"] is True
    assert data["email_header_html"] == ""
    assert data["email_footer_html"] == ""


@pytest.mark.asyncio
async def test_update_email_settings(client: AsyncClient, tenant_admin_token):
    """PUT updates email settings correctly."""
    resp = await client.put(
        "/api/v1/trainings/email-settings",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
        json={
            "email_sending_enabled": False,
            "email_header_html": "<p>Header</p>",
            "email_footer_html": "<p>Footer</p>",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email_sending_enabled"] is False
    assert "Header" in data["email_header_html"]
    assert "Footer" in data["email_footer_html"]


@pytest.mark.asyncio
async def test_get_templates_default(client: AsyncClient, tenant_admin_token):
    """GET returns 7 templates with defaults."""
    resp = await client.get(
        "/api/v1/trainings/email-templates",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 9
    assert all(t["is_default"] is True for t in data)
    types = [t["template_type"] for t in data]
    assert "training_registration_confirmation" in types
    assert "training_invoice_send" in types


@pytest.mark.asyncio
async def test_get_single_template(client: AsyncClient, tenant_admin_token):
    """GET single template returns default."""
    resp = await client.get(
        "/api/v1/trainings/email-templates/training_attendee_welcome",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["template_type"] == "training_attendee_welcome"
    assert data["is_default"] is True
    assert "Welcome" in data["subject"]


@pytest.mark.asyncio
async def test_update_template(client: AsyncClient, tenant_admin_token):
    """PUT creates/updates a template."""
    resp = await client.put(
        "/api/v1/trainings/email-templates/training_invoice_send",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
        json={
            "subject": "Custom Invoice — [Training Name]",
            "body_html": "<p>Custom body</p>",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["subject"] == "Custom Invoice — [Training Name]"
    assert data["is_default"] is False

    # Verify it persists
    resp2 = await client.get(
        "/api/v1/trainings/email-templates/training_invoice_send",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
    )
    assert resp2.json()["is_default"] is False
    assert resp2.json()["subject"] == "Custom Invoice — [Training Name]"


@pytest.mark.asyncio
async def test_delete_template(client: AsyncClient, tenant_admin_token):
    """DELETE resets template to default."""
    # First save a custom template
    await client.put(
        "/api/v1/trainings/email-templates/training_attendee_welcome",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
        json={"subject": "Custom Subject"},
    )
    # Now delete (reset)
    resp = await client.delete(
        "/api/v1/trainings/email-templates/training_attendee_welcome",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_default"] is True
    assert "Welcome" in data["subject"]


@pytest.mark.asyncio
async def test_invalid_template_type(client: AsyncClient, tenant_admin_token):
    """PUT with invalid template type returns error."""
    resp = await client.put(
        "/api/v1/trainings/email-templates/nonexistent_type",
        headers={"Authorization": f"Bearer {tenant_admin_token}"},
        json={"subject": "Test"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_requires_admin(client: AsyncClient, regular_user_token):
    """PUT requires tenant admin."""
    resp = await client.put(
        "/api/v1/trainings/email-settings",
        headers={"Authorization": f"Bearer {regular_user_token}"},
        json={"email_sending_enabled": False},
    )
    assert resp.status_code == 403
