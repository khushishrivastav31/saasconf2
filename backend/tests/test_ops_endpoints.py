"""Tests for ops endpoints (data retention, deadline reminders)."""

import pytest
from httpx import AsyncClient

from app.config import get_settings

settings = get_settings()

# ═══════════════════════════════════════════════════════════════════════
# SECURITY TESTS - Rate Limiting
# ═══════════════════════════════════════════════════════════════════════


@pytest.mark.skip(
    reason="Requires PostgreSQL stored procedures (run_data_retention_cleanup) "
    "which are only available in production/staging environments"
)
@pytest.mark.asyncio
async def test_data_retention_endpoint_rate_limited(client: AsyncClient) -> None:
    """Verify data retention cleanup endpoint enforces rate limiting.

    Should reject requests after 5 attempts per hour per IP.
    """
    auth_header = f"Bearer {settings.SUPER_ADMIN_PASSWORD}"

    # Make 5 requests (should all succeed or hit the endpoint)
    responses = []
    for _ in range(5):
        response = await client.post(
            "/ops/data-retention-cleanup",
            headers={"Authorization": auth_header},
        )
        responses.append(response)

    # First 5 should not be rate limited (may fail for other reasons like DB)
    # But status should not be 429 (Too Many Requests)
    for i, response in enumerate(responses):
        assert response.status_code != 429, f"Request {i + 1}/5 was rate limited"

    # 6th request should be rate limited
    response_6 = await client.post(
        "/ops/data-retention-cleanup",
        headers={"Authorization": auth_header},
    )
    assert response_6.status_code == 429, "6th request should be rate limited"


@pytest.mark.skip(
    reason="Requires PostgreSQL stored procedures (run_send_deadline_reminders) "
    "which are only available in production/staging environments"
)
@pytest.mark.asyncio
async def test_deadline_reminders_endpoint_rate_limited(client: AsyncClient) -> None:
    """Verify deadline reminders endpoint enforces rate limiting.

    Should reject requests after 5 attempts per hour per IP.
    """
    auth_header = f"Bearer {settings.SUPER_ADMIN_PASSWORD}"

    # Make 5 requests (should all succeed or hit the endpoint)
    responses = []
    for _ in range(5):
        response = await client.post(
            "/ops/send-deadline-reminders",
            headers={"Authorization": auth_header},
        )
        responses.append(response)

    # First 5 should not be rate limited
    for i, response in enumerate(responses):
        assert response.status_code != 429, f"Request {i + 1}/5 was rate limited"

    # 6th request should be rate limited
    response_6 = await client.post(
        "/ops/send-deadline-reminders",
        headers={"Authorization": auth_header},
    )
    assert response_6.status_code == 429, "6th request should be rate limited"


@pytest.mark.asyncio
async def test_ops_endpoints_require_authentication(client: AsyncClient) -> None:
    """Verify ops endpoints reject requests without proper authentication."""
    # Test data retention without auth
    response = await client.post("/ops/data-retention-cleanup")
    assert response.status_code == 401

    # Test with wrong auth
    response = await client.post(
        "/ops/data-retention-cleanup",
        headers={"Authorization": "Bearer wrong-password"},
    )
    assert response.status_code == 401

    # Test deadline reminders without auth
    response = await client.post("/ops/send-deadline-reminders")
    assert response.status_code == 401

    # Test with wrong auth
    response = await client.post(
        "/ops/send-deadline-reminders",
        headers={"Authorization": "Bearer wrong-password"},
    )
    assert response.status_code == 401
