"""Tests for the conference payment-reminder settings endpoint.

Covers:
- GET returns defaults when no settings are stored
- PUT persists the toggle and reflects on the next GET
- Non-admin is rejected on PUT
"""

import pytest
from httpx import AsyncClient

AUTH = "Authorization"


@pytest.mark.asyncio
async def test_get_payment_reminder_settings_defaults(
    client: AsyncClient,
    conference,
    tenant_admin_token: str,
) -> None:
    """GET returns default settings when nothing has been configured."""
    resp = await client.get(
        f"/api/v1/conferences/{conference.id}/settings/payment-reminder-settings",
        headers={AUTH: f"Bearer {tenant_admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["payment_reminders_enabled"] is True
    assert data["first_reminder_days"] == 2
    assert data["second_reminder_days"] == 17
    assert data["notify_admin_after_second"] is True


@pytest.mark.asyncio
async def test_put_payment_reminder_settings_persists(
    client: AsyncClient,
    conference,
    tenant_admin_token: str,
) -> None:
    """PUT persists the toggle; subsequent GET returns the updated value."""
    payload = {
        "payment_reminders_enabled": False,
        "first_reminder_days": 5,
        "second_reminder_days": 20,
        "notify_admin_after_second": False,
    }
    put_resp = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/payment-reminder-settings",
        headers={AUTH: f"Bearer {tenant_admin_token}"},
        json=payload,
    )
    assert put_resp.status_code == 200
    put_data = put_resp.json()
    assert put_data["payment_reminders_enabled"] is False
    assert put_data["first_reminder_days"] == 5

    get_resp = await client.get(
        f"/api/v1/conferences/{conference.id}/settings/payment-reminder-settings",
        headers={AUTH: f"Bearer {tenant_admin_token}"},
    )
    assert get_resp.status_code == 200
    get_data = get_resp.json()
    assert get_data["payment_reminders_enabled"] is False
    assert get_data["first_reminder_days"] == 5
    assert get_data["second_reminder_days"] == 20
    assert get_data["notify_admin_after_second"] is False


@pytest.mark.asyncio
async def test_put_payment_reminder_settings_requires_admin(
    client: AsyncClient,
    conference,
    regular_user_token: str,
) -> None:
    """Regular (non-admin) users cannot update payment reminder settings."""
    payload = {
        "payment_reminders_enabled": False,
        "first_reminder_days": 5,
        "second_reminder_days": 20,
        "notify_admin_after_second": False,
    }
    resp = await client.put(
        f"/api/v1/conferences/{conference.id}/settings/payment-reminder-settings",
        headers={AUTH: f"Bearer {regular_user_token}"},
        json=payload,
    )
    assert resp.status_code in {401, 403}
