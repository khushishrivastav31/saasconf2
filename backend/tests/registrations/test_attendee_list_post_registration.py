"""Regression lock: a public portal registration appears in the admin attendees list.

MAIN-13419 — After a public registration completes, the newly registered
attendee must be returned by GET /conferences/{id}/registrations within
≤ 30 seconds (or after the admin reloads the page).

Verified before writing this test (2026-06-29):
- The endpoint already excludes only CANCELLED registrations.
- Portal registrations are created as REGISTERED_PENDING_INVOICE.
- Default ordering is newest-first (created_at DESC).
So the behaviour is already correct; this test locks it against regression.
"""

import uuid
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

BASE = "/api/v1/conferences"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def reg_module(db_session: AsyncSession) -> Module:
    m = Module(
        id=uuid.uuid4(),
        name="Registration",
        code="registration",
        description="Conference registration",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_modules(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    reg_module: Module,
) -> Tenant:
    for mod in [conferences_module, reg_module]:
        db_session.add(
            TenantModule(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                module_id=mod.id,
                is_enabled=True,
            )
        )
    await db_session.commit()
    return tenant


@pytest_asyncio.fixture()
async def enabled_conference(
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_with_modules: Tenant,
) -> Conference:
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Portal Test Conference",
        abbreviation="PTC",
        is_active=True,
        settings={"public_registration_portal": {"enabled": True}},
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def booking_option(
    db_session: AsyncSession,
    tenant: Tenant,
    enabled_conference: Conference,
) -> BookingOption:
    opt = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=enabled_conference.id,
        name="General Admission",
        is_active=True,
    )
    db_session.add(opt)
    await db_session.commit()
    return opt


@pytest.fixture()
def admin_token(tenant_admin_user: User) -> str:
    return create_access_token(
        user_id=tenant_admin_user.id,
        tenant_id=tenant_admin_user.tenant_id,
        role=tenant_admin_user.role,
        modules=["conferences", "registration"],
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _portal_url(tenant: Tenant, conference: Conference) -> str:
    return (
        f"/api/v1/portal/{tenant.slug}"
        f"/conferences/{conference.abbreviation.lower()}/register"
    )


def _registration_payload(booking_option_id: uuid.UUID) -> dict:
    suffix = uuid.uuid4().hex[:8]
    return {
        "billing": {
            "contact_first_name": "Billing",
            "contact_last_name": "Person",
            "contact_email": f"billing-{suffix}@example.org",
            "contact_phone": "+491234567890",
            "street": "Hauptstrasse 1",
            "postal_code": "10115",
            "city": "Berlin",
            "country": "DE",
            "payment_method": "bank_transfer",
        },
        "attendees": [
            {
                "first_name": "New",
                "last_name": "Attendee",
                "email": f"new-attendee-{suffix}@example.org",
                "booking_option_id": str(booking_option_id),
            }
        ],
    }


# ---------------------------------------------------------------------------
# Regression test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.legacy_truncate
async def test_new_portal_registration_appears_in_admin_list(
    client: AsyncClient,
    tenant: Tenant,
    enabled_conference: Conference,
    booking_option: BookingOption,
    admin_token: str,
) -> None:
    """A public portal registration must appear in the admin registrations list.

    Acceptance: after a POST to the portal register endpoint the new attendee's
    email is present in GET /conferences/{id}/registrations (page 1, no filters).
    """
    payload = _registration_payload(booking_option.id)
    attendee_email = payload["attendees"][0]["email"]

    with patch(
        "app.api.v1.portal.registration.create_invoice_for_registrations",
        return_value=None,
    ):
        reg_resp = await client.post(_portal_url(tenant, enabled_conference), json=payload)

    assert reg_resp.status_code in (200, 201), (
        f"Portal registration failed ({reg_resp.status_code}): {reg_resp.text}"
    )

    list_resp = await client.get(
        f"{BASE}/{enabled_conference.id}/registrations",
        headers=auth_headers(admin_token),
    )

    assert list_resp.status_code == 200
    data = list_resp.json()
    emails = {item["email"] for item in data["items"]}
    assert attendee_email in emails, (
        f"Newly registered attendee '{attendee_email}' not found in admin list. "
        f"Got: {emails}"
    )
