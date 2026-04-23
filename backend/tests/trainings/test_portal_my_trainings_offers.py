"""Portal `/portal/unified/my-trainings` must surface offer-origin attendances.

Before this change the endpoint only saw ``TrainingRegistrationAttendee`` rows,
so trainings attended via an accepted training offer were invisible to the
attendee in the portal. The UNION query here verifies offer-origin training
rows show up with ``source == "offer"`` alongside the existing registration
rows.
"""

import os
import uuid
from datetime import date

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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.portal_security import create_portal_access_token
from app.core.security import create_access_token, hash_password
from app.core.security.pii_crypto import hash_email
from app.models.customer import Customer
from app.models.location import Location
from app.models.portal_user import PortalUser
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.user import User, UserRole
from tests.conftest import auth_headers


def _make_admin_token(user: User) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=["trainings"],
    )


def _portal_headers(portal_user: PortalUser) -> dict:
    token = create_portal_access_token(portal_user.id, portal_user.tenant_id)
    return {"Authorization": f"Bearer {token}"}


BASE_OFFERS = "/api/v1/trainings/offers"
MY_TRAININGS = "/api/v1/portal/unified/my-trainings"


@pytest_asyncio.fixture
async def tenant_p(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="Portal Tenant", slug=f"portal-{uuid.uuid4().hex[:8]}")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def admin_p(db_session: AsyncSession, tenant_p: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant_p.id,
        email=f"admin-portal-{uuid.uuid4().hex[:8]}@test.com",
        first_name="Admin",
        last_name="Portal",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def customer_p(db_session: AsyncSession, tenant_p: Tenant) -> Customer:
    c = Customer(id=uuid.uuid4(), tenant_id=tenant_p.id, name="Portal Customer")
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture
async def placement_p(
    db_session: AsyncSession,
    tenant_p: Tenant,
) -> ProgramYearTraining:
    t = Training(id=uuid.uuid4(), tenant_id=tenant_p.id, name="Portal Training", slug="portal-t", duration=2)
    loc = Location(id=uuid.uuid4(), tenant_id=tenant_p.id, name="Lab", code="LAB")
    py = TrainingProgramYear(id=uuid.uuid4(), tenant_id=tenant_p.id, year=2026)
    db_session.add_all([t, loc, py])
    await db_session.commit()
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant_p.id,
        program_year_id=py.id,
        training_id=t.id,
        start_date=date(2026, 10, 5),
        placement_type="inhouse",
        location_id=loc.id,
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest.mark.asyncio
async def test_my_trainings_surfaces_offer_attendance_after_accept(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_p: User,
    tenant_p: Tenant,
    customer_p: Customer,
    placement_p: ProgramYearTraining,
) -> None:
    """An attendee whose email matches their PortalUser sees the accepted offer's training."""
    admin_token = _make_admin_token(admin_p)
    # Create offer + attendee (email matches the PortalUser we'll create next)
    offer_resp = await client.post(
        BASE_OFFERS,
        json={
            "customer_id": str(customer_p.id),
            "placement_ids": [str(placement_p.id)],
        },
        headers=auth_headers(admin_token),
    )
    offer_id = offer_resp.json()["id"]
    att_resp = await client.post(
        f"{BASE_OFFERS}/{offer_id}/attendees",
        json={
            "placement_id": str(placement_p.id),
            "first_name": "Portal",
            "last_name": "User",
            "email": "portal.user@example.com",
        },
        headers=auth_headers(admin_token),
    )
    assert att_resp.status_code == 201

    # Accept — this creates the TrainingAttendee + PortalUser as part of promotion
    accept_resp = await client.post(f"{BASE_OFFERS}/{offer_id}/accept", headers=auth_headers(admin_token))
    assert accept_resp.status_code == 200

    # Fetch the created PortalUser
    pu = (
        await db_session.execute(
            select(PortalUser).where(
                PortalUser.tenant_id == tenant_p.id,
                PortalUser.email_hash == hash_email("portal.user@example.com"),
            )
        )
    ).scalar_one()
    # The TrainingAttendee should be linked to the PortalUser
    ta = (
        await db_session.execute(
            select(TrainingAttendee).where(
                TrainingAttendee.tenant_id == tenant_p.id,
                TrainingAttendee.email_hash == hash_email("portal.user@example.com"),
            )
        )
    ).scalar_one()
    assert ta.portal_user_id == pu.id

    # Hit the portal endpoint as the attendee
    resp = await client.get(MY_TRAININGS, headers=_portal_headers(pu))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    items = body["items"]

    offer_items = [i for i in items if i.get("source") == "offer"]
    assert len(offer_items) == 1, f"Expected 1 offer-sourced item, got {len(offer_items)}: {items}"
    item = offer_items[0]
    assert item["training_name"] == "Portal Training"
    assert item["status"] == "accepted"
    assert item["offer_id"] == offer_id
    assert item["start_date"] == "2026-10-05"


@pytest.mark.asyncio
async def test_my_trainings_hides_offer_attendance_before_accept(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_p: User,
    tenant_p: Tenant,
    customer_p: Customer,
    placement_p: ProgramYearTraining,
) -> None:
    """Draft offers must not leak into the portal view."""
    admin_token = _make_admin_token(admin_p)
    # Create an offer + attendee but do NOT accept yet.
    offer_resp = await client.post(
        BASE_OFFERS,
        json={"customer_id": str(customer_p.id), "placement_ids": [str(placement_p.id)]},
        headers=auth_headers(admin_token),
    )
    offer_id = offer_resp.json()["id"]
    await client.post(
        f"{BASE_OFFERS}/{offer_id}/attendees",
        json={
            "placement_id": str(placement_p.id),
            "first_name": "Pre",
            "last_name": "Accept",
            "email": "preaccept@example.com",
        },
        headers=auth_headers(admin_token),
    )

    # Manually create a PortalUser + linked TrainingAttendee for the same email
    # (simulating a user who exists for unrelated reasons).
    pu = PortalUser(
        id=uuid.uuid4(),
        tenant_id=tenant_p.id,
        email="preaccept@example.com",
        first_name="Pre",
        last_name="Accept",
        is_active=True,
    )
    db_session.add(pu)
    await db_session.flush()
    ta = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant_p.id,
        first_name="Pre",
        last_name="Accept",
        status="active",
        portal_user_id=pu.id,
    )
    ta.email = "preaccept@example.com"
    db_session.add(ta)
    await db_session.commit()

    resp = await client.get(MY_TRAININGS, headers=_portal_headers(pu))
    assert resp.status_code == 200
    items = resp.json()["items"]
    offer_items = [i for i in items if i.get("source") == "offer"]
    assert offer_items == [], "Draft offer must not appear in the portal view"


@pytest.mark.asyncio
async def test_my_trainings_drops_offer_after_revoke(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_p: User,
    tenant_p: Tenant,
    customer_p: Customer,
    placement_p: ProgramYearTraining,
) -> None:
    """Deleting an accepted-offer attendee removes the training from their portal view."""
    admin_token = _make_admin_token(admin_p)
    offer_resp = await client.post(
        BASE_OFFERS,
        json={"customer_id": str(customer_p.id), "placement_ids": [str(placement_p.id)]},
        headers=auth_headers(admin_token),
    )
    offer_id = offer_resp.json()["id"]
    att_resp = await client.post(
        f"{BASE_OFFERS}/{offer_id}/attendees",
        json={
            "placement_id": str(placement_p.id),
            "first_name": "Will",
            "last_name": "Go",
            "email": "revoked@example.com",
        },
        headers=auth_headers(admin_token),
    )
    attendee_id = att_resp.json()["id"]
    await client.post(f"{BASE_OFFERS}/{offer_id}/accept", headers=auth_headers(admin_token))

    pu = (
        await db_session.execute(
            select(PortalUser).where(
                PortalUser.tenant_id == tenant_p.id,
                PortalUser.email_hash == hash_email("revoked@example.com"),
            )
        )
    ).scalar_one()

    # Before delete — the training shows up
    before = await client.get(MY_TRAININGS, headers=_portal_headers(pu))
    before_offers = [i for i in before.json()["items"] if i.get("source") == "offer"]
    assert len(before_offers) == 1

    # Delete the attendee
    del_resp = await client.delete(
        f"{BASE_OFFERS}/{offer_id}/attendees/{attendee_id}",
        headers=auth_headers(admin_token),
    )
    assert del_resp.status_code == 200

    # After delete — no offer items
    after = await client.get(MY_TRAININGS, headers=_portal_headers(pu))
    after_offers = [i for i in after.json()["items"] if i.get("source") == "offer"]
    assert after_offers == []
