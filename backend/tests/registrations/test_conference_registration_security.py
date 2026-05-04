"""End-to-end tests for the bot-protection layers on the public conference
registration endpoint:

    POST /api/v1/portal/{tenant_slug}/conferences/{conference_slug}/register

Covers:
- honeypot field rejection (400)
- form-too-fast rejection (400)
- per-IP rate-limit kicks in on the 4th attempt (429)

The lower-level validators in ``app/core/security/registrations.py`` are
already covered by ``tests/registrations/test_registration_security.py`` —
these tests exercise the wiring at the actual endpoint, alongside the
matching coverage on the training and CFP registration endpoints.
"""

import time

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.security.registrations import clear_rate_limits
from app.models.conference import Conference
from app.models.tenant import Tenant


@pytest.fixture(autouse=True)
def _reset_registration_rate_limits() -> None:  # type: ignore[misc]
    """Clear the in-memory IP rate-limit store before/after every test."""
    clear_rate_limits()
    yield  # type: ignore[misc]
    clear_rate_limits()


@pytest_asyncio.fixture
async def conference_with_portal_enabled(
    db_session: AsyncSession, conference: Conference
) -> Conference:
    """The default ``conference`` fixture but with the public registration
    portal enabled. Required for any request to reach the security
    validators — otherwise resolution returns 403/404 first.
    """
    conference.settings = {"public_registration_portal": {"enabled": True}}
    flag_modified(conference, "settings")
    await db_session.commit()
    await db_session.refresh(conference)
    return conference


def _minimal_registration_body(**overrides: object) -> dict[str, object]:
    """A schema-valid payload. ``booking_option_id`` is intentionally a
    placeholder UUID — the endpoint will 4xx at the booking-option
    validator, but only AFTER ``validate_registration_security`` has run,
    which is exactly what we're exercising here.
    """
    body: dict[str, object] = {
        "billing": {
            "street": "1 Test St",
            "postal_code": "10115",
            "city": "Berlin",
            "country": "DE",
            "contact_first_name": "Test",
            "contact_last_name": "User",
            "contact_phone": "+49301234567",
            "contact_email": "test@example.de",
            "payment_method": "bank_transfer",
        },
        "attendees": [
            {
                "first_name": "John",
                "last_name": "Doe",
                "email": "john@example.de",
                "booking_option_id": "00000000-0000-0000-0000-000000000001",
            }
        ],
    }
    body.update(overrides)
    return body


def _url(tenant: Tenant, conference: Conference) -> str:
    return f"/api/v1/portal/{tenant.slug}/conferences/{conference.abbreviation.lower()}/register"


@pytest.mark.asyncio
class TestConferenceRegistrationSecurity:
    """Bot-protection coverage for the conference registration endpoint."""

    async def test_rejects_filled_honeypot(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference_with_portal_enabled: Conference,
    ) -> None:
        """A non-empty honeypot value is the universal bot signal — 400."""
        body = _minimal_registration_body(honeypot_field="im-a-bot")
        resp = await client.post(_url(tenant, conference_with_portal_enabled), json=body)
        assert resp.status_code == 400
        assert "Invalid form submission" in resp.json()["detail"]

    async def test_rejects_form_submitted_too_quickly(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference_with_portal_enabled: Conference,
    ) -> None:
        """Submission less than 5 sec after the form mounted is bot-shaped."""
        body = _minimal_registration_body(form_start_timestamp=time.time())
        resp = await client.post(_url(tenant, conference_with_portal_enabled), json=body)
        assert resp.status_code == 400
        assert "too quickly" in resp.json()["detail"]

    async def test_rate_limit_429_after_three_per_hour(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference_with_portal_enabled: Conference,
    ) -> None:
        """The IP-based 3/hour limit kicks in on the 4th submission.

        Each of the first three calls passes the security validator (no
        honeypot, no too-fast timestamp) before failing at the booking-
        option validator (placeholder UUID). The validator increments the
        per-IP counter regardless of what the request does after that —
        so the fourth call hits 429 before reaching anything else.
        """
        url = _url(tenant, conference_with_portal_enabled)
        for i in range(3):
            body = _minimal_registration_body()
            body["billing"]["contact_email"] = f"rl{i}@example.de"  # type: ignore[index]
            body["attendees"][0]["email"] = f"rl{i}@example.de"  # type: ignore[index]
            resp = await client.post(url, json=body)
            assert resp.status_code != 429, (
                f"call {i + 1} unexpectedly hit rate limit: {resp.text}"
            )

        # 4th call from the same IP must be rate-limited
        body = _minimal_registration_body()
        body["billing"]["contact_email"] = "rl4@example.de"  # type: ignore[index]
        body["attendees"][0]["email"] = "rl4@example.de"  # type: ignore[index]
        resp = await client.post(url, json=body)
        assert resp.status_code == 429
        assert "Rate limit exceeded" in resp.json()["detail"]
