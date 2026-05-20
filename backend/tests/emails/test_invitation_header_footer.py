"""Tests for conference header/footer inclusion in invitation emails.

Covers:
- render_email wraps body with header/footer when conference_id is provided
- render_email returns plain body when conference_id is None
- register_applicant endpoint propagates conference_id to send_verification_email
  so the verification email includes the conference header/footer
"""

import os
import uuid
from unittest.mock import AsyncMock, patch

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email.templates import render_email
from app.core.email_templates import build_verification_context
from app.models.conference import Conference
from app.models.tenant import Tenant
from tests.conftest import auth_headers  # noqa: F401 — imported for fixture chain

PORTAL_BASE = "/api/v1/portal"
HEADER_HTML = "<p>ACME Conference Header</p>"
FOOTER_HTML = "<p>ACME Conference Footer</p>"


@pytest_asyncio.fixture()
async def conference_with_header(db_session: AsyncSession, conference: Conference) -> Conference:
    """Return the shared conference fixture with email header/footer set in settings."""
    conference.settings = {
        "email_header_html": HEADER_HTML,
        "email_footer_html": FOOTER_HTML,
    }
    await db_session.commit()
    await db_session.refresh(conference)
    return conference


class TestRenderEmailHeaderFooter:
    """Unit tests for render_email header/footer wrapping logic."""

    @pytest.mark.asyncio
    async def test_includes_header_when_conference_id_provided(
        self,
        db_session: AsyncSession,
        conference_with_header: Conference,
    ):
        """render_email wraps body with conference header when conference_id is given."""
        context = build_verification_context(
            first_name="Test",
            last_name="User",
            email="test@example.com",
            conference_name=conference_with_header.name,
            company_name="Test Corp",
            verify_link="https://example.com/verify",
            support_email="support@example.com",
        )

        result = await render_email(
            db_session,
            "applicant_verification",
            context,
            conference_id=conference_with_header.id,
        )

        assert HEADER_HTML in result.body_html
        assert FOOTER_HTML in result.body_html

    @pytest.mark.asyncio
    async def test_excludes_header_when_conference_id_is_none(
        self,
        db_session: AsyncSession,
        conference_with_header: Conference,
    ):
        """render_email does not wrap body when conference_id is None."""
        context = build_verification_context(
            first_name="Test",
            last_name="User",
            email="test@example.com",
            conference_name=conference_with_header.name,
            company_name="Test Corp",
            verify_link="https://example.com/verify",
            support_email="support@example.com",
        )

        result = await render_email(
            db_session,
            "applicant_verification",
            context,
            conference_id=None,
        )

        assert HEADER_HTML not in result.body_html
        assert FOOTER_HTML not in result.body_html


class TestRegistrationEmailHeaderFooter:
    """Integration tests: register endpoint propagates conference_id to verification email."""

    @pytest.mark.asyncio
    async def test_verification_email_includes_header_when_conference_id_passed(
        self,
        client: AsyncClient,
        tenant: Tenant,
        conference_with_header: Conference,
    ):
        """Registering with conference_id causes the verification email to include the header."""
        captured_body: list[str] = []

        original_send = __import__(
            "app.core.email", fromlist=["send_email"]
        ).send_email

        async def capturing_send_email(
            to: str, subject: str, body_html: str, body_text: str | None = None, **kwargs
        ) -> bool:
            captured_body.append(body_html)
            return True

        with patch("app.core.email.send_email", side_effect=capturing_send_email):
            response = await client.post(
                f"{PORTAL_BASE}/{tenant.slug}/register",
                json={
                    "email": f"hdr-{uuid.uuid4().hex[:8]}@example.com",
                    "password": "StrongPass1!",
                    "first_name": "Header",
                    "last_name": "Test",
                    "conference_id": str(conference_with_header.id),
                },
            )

        assert response.status_code == 200
        assert len(captured_body) == 1, "Expected exactly one email to be sent"
        assert HEADER_HTML in captured_body[0], (
            "Verification email body should include the conference header HTML"
        )
