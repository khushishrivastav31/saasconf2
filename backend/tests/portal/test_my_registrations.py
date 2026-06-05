"""Tests for GET /portal/unified/me/registrations.

Verifies:
- Authenticated attendee sees their own registrations.
- Cancelled registrations are excluded.
- Another tenant's registrations are not visible.
- Unauthenticated requests get 401.
"""

import uuid
from datetime import timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.core.security.pii_crypto import encrypt_pii, hash_email
from app.core.security.portal import create_portal_access_token
from app.core.utils import utcnow
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.portal_user import PortalUser
from app.models.registration import Registration, RegistrationStatus
from app.models.tenant import Tenant

URL = "/api/v1/portal/unified/me/registrations"


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def portal_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name=f"RegPortal Corp {uuid.uuid4().hex[:6]}",
        slug=f"reg-portal-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def portal_user(db_session: AsyncSession, portal_tenant: Tenant) -> PortalUser:
    addr = f"attendee-{uuid.uuid4().hex[:8]}@example.com"
    user = PortalUser(
        id=uuid.uuid4(),
        tenant_id=portal_tenant.id,
        email_encrypted=encrypt_pii(addr),
        email_hash=hash_email(addr),
        password_hash=hash_password("SecurePass1"),
        first_name="Alice",
        last_name="Attendee",
        email_verified_at=utcnow(),
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture()
def portal_token(portal_user: PortalUser) -> str:
    return create_portal_access_token(portal_user.id, portal_user.tenant_id)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _make_conf(db: AsyncSession, tenant: Tenant, name: str = "Test Conf") -> Conference:
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name=name,
        is_active=True,
    )
    db.add(c)
    await db.flush()
    return c


async def _make_booking_opt(db: AsyncSession, tenant: Tenant, conference: Conference) -> BookingOption:
    opt = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="General Pass",
        is_active=True,
    )
    db.add(opt)
    await db.flush()
    return opt


async def _make_registration(
    db: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    booking_option: BookingOption,
    email: str,
    status: str = RegistrationStatus.PAID.value,
) -> Registration:
    from app.models.registration import BillingProfile

    billing = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        contact_first_name="Alice",
        contact_last_name="Attendee",
        street="Some Street 1",
        postal_code="10115",
        city="Berlin",
        country="DE",
        payment_method="bank_transfer",
    )
    db.add(billing)
    await db.flush()

    reg = Registration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        billing_profile_id=billing.id,
        booking_option_id=booking_option.id,
        first_name="Alice",
        last_name="Attendee",
        email=email,
        status=status,
    )
    db.add(reg)
    await db.flush()
    return reg


# ═══════════════════════════════════════════════════════════════════════
# Tests
# ═══════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_unauthenticated_returns_401(client: AsyncClient) -> None:
    response = await client.get(URL)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_attendee_sees_own_registrations(
    client: AsyncClient,
    db_session: AsyncSession,
    portal_tenant: Tenant,
    portal_user: PortalUser,
    portal_token: str,
) -> None:
    """An attendee with 2 registrations receives both."""
    from app.core.security.pii_crypto import read_pii

    email = read_pii(portal_user, "email")

    conf1 = await _make_conf(db_session, portal_tenant, "Alpha Conf")
    conf2 = await _make_conf(db_session, portal_tenant, "Beta Conf")
    opt1 = await _make_booking_opt(db_session, portal_tenant, conf1)
    opt2 = await _make_booking_opt(db_session, portal_tenant, conf2)

    await _make_registration(db_session, portal_tenant, conf1, opt1, email)
    await _make_registration(db_session, portal_tenant, conf2, opt2, email, RegistrationStatus.INVOICED.value)
    await db_session.commit()

    response = await client.get(URL, headers=_auth(portal_token))

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    names = {r["conference_name"] for r in data}
    assert names == {"Alpha Conf", "Beta Conf"}


@pytest.mark.asyncio
async def test_cancelled_registrations_excluded(
    client: AsyncClient,
    db_session: AsyncSession,
    portal_tenant: Tenant,
    portal_user: PortalUser,
    portal_token: str,
) -> None:
    from app.core.security.pii_crypto import read_pii

    email = read_pii(portal_user, "email")

    conf = await _make_conf(db_session, portal_tenant, "Cancel Conf")
    opt = await _make_booking_opt(db_session, portal_tenant, conf)
    await _make_registration(db_session, portal_tenant, conf, opt, email, RegistrationStatus.CANCELLED.value)
    await db_session.commit()

    response = await client.get(URL, headers=_auth(portal_token))

    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_other_tenant_registrations_not_visible(
    client: AsyncClient,
    db_session: AsyncSession,
    portal_tenant: Tenant,
    portal_user: PortalUser,
    portal_token: str,
) -> None:
    """Registrations belonging to a different tenant must not appear."""
    other_tenant = Tenant(
        id=uuid.uuid4(),
        name="Other Tenant",
        slug=f"other-t-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db_session.add(other_tenant)
    await db_session.flush()

    conf_other = await _make_conf(db_session, other_tenant, "Other Conf")
    opt_other = await _make_booking_opt(db_session, other_tenant, conf_other)

    from app.core.security.pii_crypto import read_pii

    email = read_pii(portal_user, "email")
    await _make_registration(db_session, other_tenant, conf_other, opt_other, email)
    await db_session.commit()

    response = await client.get(URL, headers=_auth(portal_token))

    assert response.status_code == 200
    # The portal user belongs to portal_tenant — other tenant's data must not leak
    assert response.json() == []


@pytest.mark.asyncio
async def test_response_shape(
    client: AsyncClient,
    db_session: AsyncSession,
    portal_tenant: Tenant,
    portal_user: PortalUser,
    portal_token: str,
) -> None:
    """Each item has the expected fields."""
    from app.core.security.pii_crypto import read_pii

    email = read_pii(portal_user, "email")

    conf = await _make_conf(db_session, portal_tenant, "Shape Conf")
    opt = await _make_booking_opt(db_session, portal_tenant, conf)
    await _make_registration(db_session, portal_tenant, conf, opt, email, RegistrationStatus.PAID.value)
    await db_session.commit()

    response = await client.get(URL, headers=_auth(portal_token))

    assert response.status_code == 200
    item = response.json()[0]
    assert "id" in item
    assert "conference_id" in item
    assert "conference_name" in item
    assert "booking_option_name" in item
    assert "status" in item
    assert "invoice_id" in item
    assert "invoice_number" in item
    assert "created_at" in item
    assert item["conference_name"] == "Shape Conf"
    assert item["booking_option_name"] == "General Pass"
    assert item["status"] == RegistrationStatus.PAID.value
    assert item["invoice_id"] is None
    assert item["invoice_number"] is None
