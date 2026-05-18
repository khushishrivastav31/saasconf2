"""Regression: portal registration must commit PortalUser + setup token before session close.

Bug: portal/registration.py called create_user_for_registration() AFTER db.commit()
at line 727. The flush() inside that helper was still in an open (uncommitted)
transaction. When FastAPI closed the dependency-injected session at the end of the
request, asyncpg rolled that transaction back — so the token row had no row and every
welcome-email "set your password" link returned "Invalid or expired reset link."

Fix: create_portal_user_for_registration() is called before the main db.commit() so
the PortalUser and its PortalRefreshToken(purpose='setup') land in a single committed
transaction.
"""

import uuid
from unittest.mock import patch

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
async def portal_enabled_conference(db_session: AsyncSession, tenant: Tenant) -> Conference:
    """Conference with public_registration_portal enabled."""
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Portal Token Test Conf",
        abbreviation="PTTC",
        is_active=True,
        settings={"public_registration_portal": {"enabled": True}},
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def portal_booking_opt(
    db_session: AsyncSession,
    tenant: Tenant,
    portal_enabled_conference: Conference,
) -> BookingOption:
    """Active booking option for portal_enabled_conference."""
    opt = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=portal_enabled_conference.id,
        name="General Admission",
        is_active=True,
    )
    db_session.add(opt)
    await db_session.commit()
    return opt


def _registration_body(booking_option_id: uuid.UUID) -> dict:
    unique_suffix = uuid.uuid4().hex[:8]
    return {
        "billing": {
            "contact_first_name": "Billing",
            "contact_last_name": "Person",
            "contact_email": f"billing-{unique_suffix}@permanentmail.org",
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
                "email": f"jane-{unique_suffix}@permanentmail.org",
                "booking_option_id": str(booking_option_id),
            }
        ],
    }


@pytest.mark.asyncio
@pytest.mark.legacy_truncate
async def test_portal_registration_commits_password_reset_token(
    client: AsyncClient,
    tenant: Tenant,
    portal_enabled_conference: Conference,
    portal_booking_opt: BookingOption,
) -> None:
    """PortalUser + PortalRefreshToken(purpose='setup') must survive the request session close.

    Bug: create_user_for_registration() was called after db.commit(), so the token
    it flushed lived in a fresh uncommitted transaction. FastAPI's session close at
    request end triggered an asyncpg rollback, discarding the token.

    Fix: create_portal_user_for_registration() is called before db.commit() so the
    PortalUser and its setup token land in a single committed transaction.
    """
    body = _registration_body(portal_booking_opt.id)
    attendee_email = body["attendees"][0]["email"]
    url = (
        f"/api/v1/portal/{tenant.slug}"
        f"/conferences/{portal_enabled_conference.abbreviation.lower()}/register"
    )

    with patch(
        "app.api.v1.portal.registration.create_invoice_for_registrations",
        return_value=None,
    ):
        resp = await client.post(url, json=body)

    assert resp.status_code in (200, 201), f"Portal registration failed ({resp.status_code}): {resp.text}"

    # Use a completely independent session to verify what landed in the DB.
    async with TestSessionLocal() as fresh:
        await fresh.execute(RLS_BYPASS)

        portal_result = await fresh.execute(
            select(PortalUser).where(PortalUser.email_hash == hash_email(attendee_email))
        )
        portal_user = portal_result.scalar_one_or_none()
        assert portal_user is not None, "PortalUser was not committed after portal registration"

        token_result = await fresh.execute(
            select(PortalRefreshToken).where(
                PortalRefreshToken.portal_user_id == portal_user.id,
                PortalRefreshToken.purpose == "setup",
            )
        )
        setup_token = token_result.scalar_one_or_none()

    assert setup_token is not None, (
        "PortalRefreshToken(purpose='setup') was not committed to the DB. "
        "The welcome-email 'set your password' link cannot be redeemed."
    )
