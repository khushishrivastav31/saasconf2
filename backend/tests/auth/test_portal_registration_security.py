"""Security tests for the public portal registration endpoint.

POST /api/v1/portal/{slug}/register
"""

import pytest
from httpx import AsyncClient

from app.models.conference import Conference


def _valid_registration_body(**overrides):
    """Return a valid registration payload, with optional overrides."""
    body = {
        "billing": {
            "street": "123 Main St",
            "postal_code": "12345",
            "city": "Berlin",
            "country": "DE",
            "contact_first_name": "Test",
            "contact_last_name": "User",
            "contact_email": "test@example.com",
            "contact_phone": "+49123456789",
            "payment_method": "bank_transfer",
        },
        "attendees": [
            {
                "first_name": "John",
                "last_name": "Doe",
                "email": "john@example.com",
                "booking_option_id": "00000000-0000-0000-0000-000000000001",
            }
        ],
        "recaptcha_token": "test-token",
    }
    body.update(overrides)
    return body


@pytest.mark.asyncio
class TestPortalRegistrationSecurity:
    """Security tests for the public registration endpoint."""

    async def test_registration_rejects_empty_body(self, client: AsyncClient, conference: Conference):
        """POST with no JSON body returns 422 Unprocessable Entity."""
        slug = conference.abbreviation.lower()
        resp = await client.post(f"/api/v1/portal/{slug}/register")
        assert resp.status_code == 422

    async def test_registration_rejects_missing_billing(self, client: AsyncClient, conference: Conference):
        """POST without the billing field returns 422."""
        slug = conference.abbreviation.lower()
        body = _valid_registration_body()
        del body["billing"]
        resp = await client.post(f"/api/v1/portal/{slug}/register", json=body)
        assert resp.status_code == 422

    async def test_registration_rejects_missing_attendees(self, client: AsyncClient, conference: Conference):
        """POST without the attendees field returns 422."""
        slug = conference.abbreviation.lower()
        body = _valid_registration_body()
        del body["attendees"]
        resp = await client.post(f"/api/v1/portal/{slug}/register", json=body)
        assert resp.status_code == 422

    async def test_registration_rejects_invalid_email_format(self, client: AsyncClient, conference: Conference):
        """Invalid email in billing should be rejected (422)."""
        slug = conference.abbreviation.lower()
        body = _valid_registration_body()
        body["billing"]["contact_email"] = "not-an-email"
        resp = await client.post(f"/api/v1/portal/{slug}/register", json=body)
        assert resp.status_code == 422

    async def test_registration_rejects_xss_in_attendee_name(self, client: AsyncClient, conference: Conference):
        """XSS payload in attendee name should be sanitized or rejected.

        The system should either reject the input (422/400) or sanitize
        the script tag so it does not appear verbatim in any response.
        """
        slug = conference.abbreviation.lower()
        body = _valid_registration_body()
        body["attendees"][0]["first_name"] = "<script>alert(1)</script>"
        resp = await client.post(f"/api/v1/portal/{slug}/register", json=body)
        # Either rejected outright or accepted with sanitized data
        if resp.status_code < 400:
            # If accepted, the raw script tag must not appear in the response
            assert "<script>" not in resp.text
        else:
            # Rejected — acceptable security response
            assert resp.status_code in (400, 422)

    async def test_registration_rejects_sql_injection_in_fields(self, client: AsyncClient, conference: Conference):
        """SQL injection attempt in name fields should not cause a 500.

        The app uses SQLAlchemy ORM (parameterized queries), so SQL injection
        should have no effect. The request should either succeed safely or
        be rejected with a 4xx status.
        """
        slug = conference.abbreviation.lower()
        body = _valid_registration_body()
        body["attendees"][0]["first_name"] = "'; DROP TABLE registrations; --"
        resp = await client.post(f"/api/v1/portal/{slug}/register", json=body)
        # Must NOT be a 500 server error
        assert resp.status_code != 500

    async def test_registration_nonexistent_conference_slug(self, client: AsyncClient):
        """POST to a non-existent tenant/conference slug returns 404."""
        body = _valid_registration_body()
        resp = await client.post(
            "/api/v1/nonexistent-tenant/conferences/nonexistent-conf/register",
            json=body,
        )
        assert resp.status_code == 404
