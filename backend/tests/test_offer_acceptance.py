"""Tests for the offer acceptance + attendee promotion lifecycle."""

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

from app.core.security import create_access_token, hash_password
from app.core.security.pii_crypto import hash_email
from app.models.audit import AuditAction, AuditLog
from app.models.customer import Customer
from app.models.customer_offer import CustomerOffer
from app.models.location import Location
from app.models.offer_attendee import OfferAttendee
from app.models.portal_user import PortalUser
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.user import User, UserRole
from tests.conftest import auth_headers

# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=["trainings"],
    )


BASE_OFFERS = "/api/v1/trainings/offers"


def _attendees_url(offer_id) -> str:
    return f"{BASE_OFFERS}/{offer_id}/attendees"


def _accept_url(offer_id) -> str:
    return f"{BASE_OFFERS}/{offer_id}/accept"


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def tenant_a(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="Accept Tenant", slug=f"accept-{uuid.uuid4().hex[:8]}")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def admin_a(db_session: AsyncSession, tenant_a: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        email=f"admin-accept-{uuid.uuid4().hex[:8]}@test.com",
        first_name="Admin",
        last_name="Accept",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def customer_a(db_session: AsyncSession, tenant_a: Tenant) -> Customer:
    c = Customer(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        name="Accept Customer GmbH",
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture
async def training_a(db_session: AsyncSession, tenant_a: Tenant) -> Training:
    t = Training(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        name="ISTQB Foundation",
        slug="istqb-foundation",
        duration=3,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def location_a(db_session: AsyncSession, tenant_a: Tenant) -> Location:
    loc = Location(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        name="Munich",
        code="MUC",
    )
    db_session.add(loc)
    await db_session.commit()
    return loc


@pytest_asyncio.fixture
async def program_year_a(db_session: AsyncSession, tenant_a: Tenant) -> TrainingProgramYear:
    py = TrainingProgramYear(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        year=2026,
    )
    db_session.add(py)
    await db_session.commit()
    return py


@pytest_asyncio.fixture
async def placement_a(
    db_session: AsyncSession,
    tenant_a: Tenant,
    program_year_a: TrainingProgramYear,
    training_a: Training,
    location_a: Location,
) -> ProgramYearTraining:
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        program_year_id=program_year_a.id,
        training_id=training_a.id,
        start_date=date(2026, 6, 15),
        placement_type="inhouse",
        location_id=location_a.id,
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture
async def offer_with_placement(
    client: AsyncClient,
    admin_a: User,
    customer_a: Customer,
    placement_a: ProgramYearTraining,
) -> str:
    """Create a draft offer with the given placement; return its UUID."""
    token = _make_token(admin_a)
    resp = await client.post(
        BASE_OFFERS,
        json={
            "customer_id": str(customer_a.id),
            "placement_ids": [str(placement_a.id)],
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    # Attach the inhouse placement to the offer so the attendee insert validates.
    # Offers.create already writes to offer_placements for all requested ids.
    return resp.json()["id"]


async def _add_attendee(
    client: AsyncClient,
    token: str,
    offer_id: str,
    placement_id,
    *,
    first_name: str,
    last_name: str,
    email: str | None,
) -> dict:
    resp = await client.post(
        _attendees_url(offer_id),
        json={
            "placement_id": str(placement_id),
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Tests ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_accept_offer_promotes_all_attendees(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_a: User,
    tenant_a: Tenant,
    placement_a: ProgramYearTraining,
    offer_with_placement: str,
) -> None:
    """Accepting an offer creates TrainingAttendee + PortalUser for each attendee and links them."""
    token = _make_token(admin_a)
    offer_id = offer_with_placement

    await _add_attendee(
        client,
        token,
        offer_id,
        placement_a.id,
        first_name="Alice",
        last_name="Adams",
        email="alice@example.com",
    )
    await _add_attendee(
        client,
        token,
        offer_id,
        placement_a.id,
        first_name="Bob",
        last_name="Baker",
        email="bob@example.com",
    )

    resp = await client.post(_accept_url(offer_id), headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["attendees_promoted"] == 2

    # Offer status flipped
    offer_row = (
        await db_session.execute(select(CustomerOffer).where(CustomerOffer.id == uuid.UUID(offer_id)))
    ).scalar_one()
    await db_session.refresh(offer_row)
    assert offer_row.status == "accepted"

    # Each OfferAttendee has a linked TrainingAttendee
    oa_rows = (
        (await db_session.execute(select(OfferAttendee).where(OfferAttendee.offer_id == uuid.UUID(offer_id))))
        .scalars()
        .all()
    )
    assert len(oa_rows) == 2
    assert all(oa.attendee_id is not None for oa in oa_rows)

    # TrainingAttendee rows exist with correct email_hash
    for email in ("alice@example.com", "bob@example.com"):
        ta = (
            await db_session.execute(
                select(TrainingAttendee).where(
                    TrainingAttendee.tenant_id == tenant_a.id,
                    TrainingAttendee.email_hash == hash_email(email),
                )
            )
        ).scalar_one_or_none()
        assert ta is not None, f"TrainingAttendee missing for {email}"
        assert ta.status == "active"
        assert ta.portal_user_id is not None

        # PortalUser exists
        pu = (
            await db_session.execute(
                select(PortalUser).where(
                    PortalUser.tenant_id == tenant_a.id,
                    PortalUser.email_hash == hash_email(email),
                )
            )
        ).scalar_one_or_none()
        assert pu is not None
        assert pu.id == ta.portal_user_id

    # Audit: OFFER_ACCEPTED once + OFFER_ATTENDEE_PROMOTED twice
    audits = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    AuditLog.tenant_id == tenant_a.id,
                    AuditLog.action.in_([AuditAction.OFFER_ACCEPTED, AuditAction.OFFER_ATTENDEE_PROMOTED]),
                )
            )
        )
        .scalars()
        .all()
    )
    assert sum(1 for a in audits if a.action == AuditAction.OFFER_ACCEPTED) == 1
    assert sum(1 for a in audits if a.action == AuditAction.OFFER_ATTENDEE_PROMOTED) == 2


@pytest.mark.asyncio
async def test_accept_offer_rejects_attendees_without_email(
    client: AsyncClient,
    admin_a: User,
    placement_a: ProgramYearTraining,
    offer_with_placement: str,
) -> None:
    """Acceptance fails with 400 if any attendee is missing an email."""
    token = _make_token(admin_a)
    offer_id = offer_with_placement

    await _add_attendee(
        client,
        token,
        offer_id,
        placement_a.id,
        first_name="NoEmail",
        last_name="Person",
        email=None,
    )
    resp = await client.post(_accept_url(offer_id), headers=auth_headers(token))
    assert resp.status_code == 400
    assert "missing email" in resp.text.lower()


@pytest.mark.asyncio
async def test_accept_offer_twice_returns_conflict(
    client: AsyncClient,
    admin_a: User,
    placement_a: ProgramYearTraining,
    offer_with_placement: str,
) -> None:
    """Re-accepting a already-accepted offer is rejected."""
    token = _make_token(admin_a)
    offer_id = offer_with_placement

    await _add_attendee(
        client,
        token,
        offer_id,
        placement_a.id,
        first_name="First",
        last_name="Try",
        email="first@test.com",
    )
    first = await client.post(_accept_url(offer_id), headers=auth_headers(token))
    assert first.status_code == 200

    second = await client.post(_accept_url(offer_id), headers=auth_headers(token))
    assert second.status_code == 400
    assert "already accepted" in second.text.lower()


@pytest.mark.asyncio
async def test_post_acceptance_attendee_insert_runs_promotion(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_a: User,
    tenant_a: Tenant,
    placement_a: ProgramYearTraining,
    offer_with_placement: str,
) -> None:
    """Adding an attendee after acceptance immediately promotes them."""
    token = _make_token(admin_a)
    offer_id = offer_with_placement

    await _add_attendee(
        client,
        token,
        offer_id,
        placement_a.id,
        first_name="Alpha",
        last_name="One",
        email="alpha@x.com",
    )
    resp = await client.post(_accept_url(offer_id), headers=auth_headers(token))
    assert resp.status_code == 200

    # Insert a second attendee POST-acceptance
    late = await _add_attendee(
        client,
        token,
        offer_id,
        placement_a.id,
        first_name="Late",
        last_name="Comer",
        email="late@x.com",
    )

    # late attendee should be promoted: OfferAttendee.attendee_id populated,
    # TrainingAttendee + PortalUser exist for late@x.com
    oa = (await db_session.execute(select(OfferAttendee).where(OfferAttendee.id == uuid.UUID(late["id"])))).scalar_one()
    await db_session.refresh(oa)
    assert oa.attendee_id is not None

    ta = (
        await db_session.execute(
            select(TrainingAttendee).where(
                TrainingAttendee.tenant_id == tenant_a.id,
                TrainingAttendee.email_hash == hash_email("late@x.com"),
            )
        )
    ).scalar_one()
    assert ta.portal_user_id is not None

    # Audit includes a second OFFER_ATTENDEE_PROMOTED for the late add
    promoted = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    AuditLog.tenant_id == tenant_a.id,
                    AuditLog.action == AuditAction.OFFER_ATTENDEE_PROMOTED,
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(promoted) == 2


@pytest.mark.asyncio
async def test_post_acceptance_attendee_insert_without_email_rejected(
    client: AsyncClient,
    admin_a: User,
    placement_a: ProgramYearTraining,
    offer_with_placement: str,
) -> None:
    """Inserting an email-less attendee on an accepted offer is rejected (400)."""
    token = _make_token(admin_a)
    offer_id = offer_with_placement

    await _add_attendee(
        client,
        token,
        offer_id,
        placement_a.id,
        first_name="Fine",
        last_name="Email",
        email="fine@x.com",
    )
    accept = await client.post(_accept_url(offer_id), headers=auth_headers(token))
    assert accept.status_code == 200

    resp = await client.post(
        _attendees_url(offer_id),
        json={
            "placement_id": str(placement_a.id),
            "first_name": "NoEmail",
            "last_name": "Late",
            "email": None,
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    assert "without an email" in resp.text.lower() or "missing email" in resp.text.lower()


@pytest.mark.asyncio
async def test_promotion_is_idempotent_for_existing_training_attendee(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_a: User,
    tenant_a: Tenant,
    placement_a: ProgramYearTraining,
    offer_with_placement: str,
) -> None:
    """A TrainingAttendee that already exists gets reused + reactivated from parked."""
    # Pre-create a parked TrainingAttendee for reuse@x.com
    preexisting = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant_a.id,
        first_name="Old",
        last_name="Name",
        status="parked",
    )
    preexisting.email = "reuse@x.com"  # triggers encrypt + hash
    db_session.add(preexisting)
    await db_session.commit()

    token = _make_token(admin_a)
    offer_id = offer_with_placement
    await _add_attendee(
        client,
        token,
        offer_id,
        placement_a.id,
        first_name="New",
        last_name="Name",
        email="reuse@x.com",
    )
    resp = await client.post(_accept_url(offer_id), headers=auth_headers(token))
    assert resp.status_code == 200

    await db_session.refresh(preexisting)
    assert preexisting.status == "active"
    assert preexisting.first_name == "New"  # name refreshed from offer attendee
    assert preexisting.last_name == "Name"
    # No duplicate TrainingAttendee created
    count = (
        (
            await db_session.execute(
                select(TrainingAttendee).where(
                    TrainingAttendee.tenant_id == tenant_a.id,
                    TrainingAttendee.email_hash == hash_email("reuse@x.com"),
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(count) == 1
