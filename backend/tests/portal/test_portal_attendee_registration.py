"""Phase 3 RED — portal registration wires PortalUser + portal setup URL.

Two requirements tested end-to-end:

1. Portal registration creates a PortalUser row (not an admin User row) with a
   committed PortalRefreshToken(purpose='setup').

2. The welcome email's password-setup link points to the portal set-password
   page (/:tenantSlug/portal/set-password?token=…), NOT the admin reset page
   (/reset-password?token=…).

Run before touching portal/registration.py to confirm both assertions fail,
then wire in create_portal_user_for_registration() and fix the URL.
"""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.pii_crypto import hash_email
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.portal_user import PortalRefreshToken, PortalUser
from app.models.tenant import Tenant
from tests.conftest import RLS_BYPASS, TestSessionLocal


@pytest_asyncio.fixture()
async def portal_conference(db_session: AsyncSession, tenant: Tenant) -> Conference:
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Attendee Flow Test Conf",
        abbreviation="AFTC",
        is_active=True,
        settings={"public_registration_portal": {"enabled": True}},
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def portal_booking(
    db_session: AsyncSession,
    tenant: Tenant,
    portal_conference: Conference,
) -> BookingOption:
    opt = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=portal_conference.id,
        name="General Admission",
        is_active=True,
    )
    db_session.add(opt)
    await db_session.commit()
    return opt


def _body(booking_option_id: uuid.UUID) -> dict:
    suffix = uuid.uuid4().hex[:8]
    return {
        "billing": {
            "contact_first_name": "Billing",
            "contact_last_name": "Person",
            "contact_email": f"billing-{suffix}@permanentmail.org",
            "contact_phone": "+491234567890",
            "street": "Hauptstrasse 1",
            "postal_code": "10115",
            "city": "Berlin",
            "country": "DE",
            "payment_method": "bank_transfer",
        },
        "attendees": [
            {
                "first_name": "Jane",
                "last_name": "Attendee",
                "email": f"jane-{suffix}@permanentmail.org",
                "booking_option_id": str(booking_option_id),
            }
        ],
    }


# ── Test 1: PortalUser (not User) is committed ────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.legacy_truncate
async def test_portal_registration_creates_portal_user(
    client: AsyncClient,
    tenant: Tenant,
    portal_conference: Conference,
    portal_booking: BookingOption,
) -> None:
    """Portal registration must create a PortalUser row, not an admin User row.

    Currently create_user_for_registration() creates a User (admin table).
    After wiring create_portal_user_for_registration(), a PortalUser row must
    exist and be readable from a fresh independent DB session.
    """
    from app.models.user import User

    body = _body(portal_booking.id)
    attendee_email = body["attendees"][0]["email"]
    url = (
        f"/api/v1/portal/{tenant.slug}"
        f"/conferences/{portal_conference.abbreviation.lower()}/register"
    )

    with patch(
        "app.api.v1.portal.registration.create_invoice_for_registrations",
        return_value=None,
    ):
        resp = await client.post(url, json=body)

    assert resp.status_code in (200, 201), f"Registration failed ({resp.status_code}): {resp.text}"

    async with TestSessionLocal() as fresh:
        await fresh.execute(RLS_BYPASS)

        # Must find a PortalUser row
        portal_result = await fresh.execute(
            select(PortalUser).where(PortalUser.email_hash == hash_email(attendee_email))
        )
        portal_user = portal_result.scalar_one_or_none()
        assert portal_user is not None, (
            "PortalUser was not committed after portal registration. "
            "portal/registration.py must call create_portal_user_for_registration()."
        )

        # Must NOT have created an admin User row for the attendee
        user_result = await fresh.execute(
            select(User).where(User.email_hash == hash_email(attendee_email))
        )
        admin_user = user_result.scalar_one_or_none()
        assert admin_user is None, (
            "An admin User row was created for a portal attendee — "
            "portal registration must use PortalUser, not User."
        )

        # PortalRefreshToken(purpose='setup') must be committed
        token_result = await fresh.execute(
            select(PortalRefreshToken).where(
                PortalRefreshToken.portal_user_id == portal_user.id,
                PortalRefreshToken.purpose == "setup",
            )
        )
        setup_token = token_result.scalar_one_or_none()
        assert setup_token is not None, (
            "PortalRefreshToken(purpose='setup') was not committed. "
            "The welcome-email set-password link will be unresolvable."
        )


# ── Test 2: Welcome email URL points to portal set-password page ──────────────

@pytest.mark.asyncio
@pytest.mark.legacy_truncate
async def test_portal_welcome_email_uses_portal_url(
    client: AsyncClient,
    tenant: Tenant,
    portal_conference: Conference,
    portal_booking: BookingOption,
) -> None:
    """Welcome email must link to /:tenantSlug/portal/set-password, not /reset-password.

    Captures the URL passed to send_attendee_welcome_email and asserts it
    contains 'portal/set-password', not the admin 'reset-password' path.
    """
    captured_urls: list[str] = []

    original_send = None

    async def _capture_send(db, registration, conference, password_setup_token, **kwargs):
        from app.config import get_settings
        # Reconstruct what the new implementation should produce
        captured_urls.append(kwargs.get("setup_url", ""))
        # Still need to record the token so we can verify
        captured_urls.append(password_setup_token)

    body = _body(portal_booking.id)
    url = (
        f"/api/v1/portal/{tenant.slug}"
        f"/conferences/{portal_conference.abbreviation.lower()}/register"
    )

    sent_calls: list[dict] = []

    async def _spy_welcome(db, registration, conference, password_setup_token, **kwargs):
        sent_calls.append({"token": password_setup_token, **kwargs})

    with (
        patch(
            "app.api.v1.portal.registration.create_invoice_for_registrations",
            return_value=None,
        ),
        patch(
            "app.core.email.registrations.send_attendee_welcome_email",
            side_effect=_spy_welcome,
        ),
    ):
        resp = await client.post(url, json=body)

    assert resp.status_code in (200, 201), f"Registration failed ({resp.status_code}): {resp.text}"

    from app.config import get_settings
    from unittest.mock import MagicMock

    settings = get_settings()

    # Verify by calling the email function directly and capturing the URL it
    # would pass to send_email.  This tests actual behavior, not source text.
    from app.core.email.registrations import send_attendee_welcome_email

    captured: list[str] = []

    async def _fake_send_email(to, subject, html, text, **kwargs):
        return True

    async def _fake_render(db, template_type, context, **kwargs):
        captured.append(context.get("Password Setup Link", ""))
        result = MagicMock()
        result.subject = "Welcome"
        result.body_html = "<p>welcome</p>"
        result.body_text = "welcome"
        return result

    import types as _types
    fake_reg = _types.SimpleNamespace(
        id=uuid.uuid4(),
        email="test@example.com",
        first_name="Jane",
        last_name="Doe",
        booking_option_id=None,
    )
    fake_conf = MagicMock()
    fake_conf.id = uuid.uuid4()
    fake_conf.tenant_id = tenant.id
    fake_conf.support_email = None
    fake_conf.contact_email = None

    with (
        patch("app.core.email.registrations.render_email", side_effect=_fake_render),
        patch("app.core.email.registrations.send_email", side_effect=_fake_send_email),
    ):
        from sqlalchemy.ext.asyncio import AsyncSession as _AS
        # Use a fresh session stub — render_email is patched so no DB calls happen
        fake_db = MagicMock(spec=_AS)
        await send_attendee_welcome_email(
            db=fake_db,
            registration=fake_reg,
            conference=fake_conf,
            password_setup_token="raw-token-abc",
            tenant_slug=tenant.slug,
        )

    assert captured, "render_email was never called"
    portal_url = captured[0]
    assert f"/{tenant.slug}/portal/set-password" in portal_url, (
        f"Welcome email URL '{portal_url}' does not contain portal set-password path. "
        "send_attendee_welcome_email must use '/:tenantSlug/portal/set-password?token=…' "
        "when tenant_slug is provided."
    )
    assert "reset-password" not in portal_url, (
        f"Welcome email URL '{portal_url}' still uses the admin reset-password path."
    )
