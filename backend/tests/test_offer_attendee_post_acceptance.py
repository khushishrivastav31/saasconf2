"""Post-acceptance edit/delete lifecycle tests for offer attendees.

Covers:
  * Deleting an attendee on an accepted offer revokes the linkage (OfferAttendee.attendee_id -> None
    before delete) but preserves the TrainingAttendee + PortalUser.
  * Editing an attendee's email on an accepted offer revokes the old identity and
    re-promotes against the new email.
  * Name-only edits (email unchanged) on an accepted offer just sync the name
    into the linked TrainingAttendee. No revoke audit, no new portal user.
  * Edits on a DRAFT offer don't run promotion/revocation at all.
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

from app.core.security import create_access_token, hash_password
from app.core.security.pii_crypto import hash_email
from app.models.audit import AuditAction, AuditLog
from app.models.customer import Customer
from app.models.location import Location
from app.models.offer_attendee import OfferAttendee
from app.models.portal_user import PortalUser
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.user import User, UserRole
from tests.conftest import auth_headers


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


# ── Fixtures (shared shape with test_offer_acceptance; isolated per-tenant) ──


@pytest_asyncio.fixture
async def tenant_e(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="Edit Tenant", slug=f"edit-{uuid.uuid4().hex[:8]}")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def admin_e(db_session: AsyncSession, tenant_e: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant_e.id,
        email=f"admin-edit-{uuid.uuid4().hex[:8]}@test.com",
        first_name="Admin",
        last_name="Edit",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def customer_e(db_session: AsyncSession, tenant_e: Tenant) -> Customer:
    c = Customer(id=uuid.uuid4(), tenant_id=tenant_e.id, name="Edit Customer")
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture
async def placement_e(
    db_session: AsyncSession,
    tenant_e: Tenant,
) -> ProgramYearTraining:
    t = Training(id=uuid.uuid4(), tenant_id=tenant_e.id, name="Edit Training", slug="edit-t", duration=2)
    loc = Location(id=uuid.uuid4(), tenant_id=tenant_e.id, name="Room X", code="RX")
    py = TrainingProgramYear(id=uuid.uuid4(), tenant_id=tenant_e.id, year=2026)
    db_session.add_all([t, loc, py])
    await db_session.commit()
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant_e.id,
        program_year_id=py.id,
        training_id=t.id,
        start_date=date(2026, 9, 10),
        placement_type="inhouse",
        location_id=loc.id,
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture
async def accepted_offer_with_alice(
    client: AsyncClient,
    admin_e: User,
    customer_e: Customer,
    placement_e: ProgramYearTraining,
) -> tuple[str, str]:
    """Create an offer, add Alice as attendee, accept. Returns (offer_id, attendee_id)."""
    token = _make_token(admin_e)
    offer_resp = await client.post(
        BASE_OFFERS,
        json={
            "customer_id": str(customer_e.id),
            "placement_ids": [str(placement_e.id)],
        },
        headers=auth_headers(token),
    )
    assert offer_resp.status_code == 201
    offer_id = offer_resp.json()["id"]

    att_resp = await client.post(
        _attendees_url(offer_id),
        json={
            "placement_id": str(placement_e.id),
            "first_name": "Alice",
            "last_name": "Adams",
            "email": "alice@example.com",
        },
        headers=auth_headers(token),
    )
    assert att_resp.status_code == 201
    attendee_id = att_resp.json()["id"]

    accept_resp = await client.post(_accept_url(offer_id), headers=auth_headers(token))
    assert accept_resp.status_code == 200

    return offer_id, attendee_id


# ── Tests ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_attendee_post_accept_revokes_and_preserves_portal_user(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_e: User,
    tenant_e: Tenant,
    accepted_offer_with_alice: tuple[str, str],
) -> None:
    """Deleting a post-acceptance attendee logs a revoke, keeps PortalUser intact."""
    token = _make_token(admin_e)
    offer_id, attendee_id = accepted_offer_with_alice

    # Baseline: PortalUser + TrainingAttendee exist
    alice_pu = (
        await db_session.execute(
            select(PortalUser).where(
                PortalUser.tenant_id == tenant_e.id,
                PortalUser.email_hash == hash_email("alice@example.com"),
            )
        )
    ).scalar_one()
    alice_ta = (
        await db_session.execute(
            select(TrainingAttendee).where(
                TrainingAttendee.tenant_id == tenant_e.id,
                TrainingAttendee.email_hash == hash_email("alice@example.com"),
            )
        )
    ).scalar_one()

    del_resp = await client.delete(
        f"{_attendees_url(offer_id)}/{attendee_id}",
        headers=auth_headers(token),
    )
    assert del_resp.status_code == 200

    # OfferAttendee gone
    oa = (
        await db_session.execute(select(OfferAttendee).where(OfferAttendee.id == uuid.UUID(attendee_id)))
    ).scalar_one_or_none()
    assert oa is None

    # PortalUser and TrainingAttendee still exist (identity preserved)
    await db_session.refresh(alice_pu)
    await db_session.refresh(alice_ta)
    assert alice_pu is not None
    assert alice_ta is not None

    # Revoke audit written with reason=deleted
    revokes = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    AuditLog.tenant_id == tenant_e.id,
                    AuditLog.action == AuditAction.OFFER_ATTENDEE_REVOKED,
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(revokes) == 1
    assert revokes[0].details.get("reason") == "deleted"


@pytest.mark.asyncio
async def test_delete_attendee_on_draft_offer_skips_revoke_audit(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_e: User,
    tenant_e: Tenant,
    customer_e: Customer,
    placement_e: ProgramYearTraining,
) -> None:
    """Deleting an attendee on a DRAFT offer has no revoke side-effect."""
    token = _make_token(admin_e)
    offer_resp = await client.post(
        BASE_OFFERS,
        json={"customer_id": str(customer_e.id), "placement_ids": [str(placement_e.id)]},
        headers=auth_headers(token),
    )
    offer_id = offer_resp.json()["id"]
    att_resp = await client.post(
        _attendees_url(offer_id),
        json={
            "placement_id": str(placement_e.id),
            "first_name": "Draft",
            "last_name": "Attendee",
            "email": "draft@x.com",
        },
        headers=auth_headers(token),
    )
    attendee_id = att_resp.json()["id"]

    del_resp = await client.delete(f"{_attendees_url(offer_id)}/{attendee_id}", headers=auth_headers(token))
    assert del_resp.status_code == 200

    revokes = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    AuditLog.tenant_id == tenant_e.id,
                    AuditLog.action == AuditAction.OFFER_ATTENDEE_REVOKED,
                )
            )
        )
        .scalars()
        .all()
    )
    assert revokes == []


@pytest.mark.asyncio
async def test_email_change_post_accept_revokes_and_re_promotes(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_e: User,
    tenant_e: Tenant,
    accepted_offer_with_alice: tuple[str, str],
) -> None:
    """Swapping the email on an accepted attendee revokes the old and promotes the new."""
    token = _make_token(admin_e)
    offer_id, attendee_id = accepted_offer_with_alice

    # Change email alice@example.com → alice+new@example.com
    resp = await client.put(
        f"{_attendees_url(offer_id)}/{attendee_id}",
        json={"email": "alice+new@example.com"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.text

    # OfferAttendee now points to the NEW TrainingAttendee
    oa = (
        await db_session.execute(select(OfferAttendee).where(OfferAttendee.id == uuid.UUID(attendee_id)))
    ).scalar_one()
    await db_session.refresh(oa)
    assert oa.email == "alice+new@example.com"
    assert oa.attendee_id is not None

    new_ta = (
        await db_session.execute(
            select(TrainingAttendee).where(
                TrainingAttendee.tenant_id == tenant_e.id,
                TrainingAttendee.email_hash == hash_email("alice+new@example.com"),
            )
        )
    ).scalar_one()
    assert oa.attendee_id == new_ta.id
    assert new_ta.portal_user_id is not None

    # Old TrainingAttendee (alice@example.com) still exists — identity preserved
    old_ta = (
        await db_session.execute(
            select(TrainingAttendee).where(
                TrainingAttendee.tenant_id == tenant_e.id,
                TrainingAttendee.email_hash == hash_email("alice@example.com"),
            )
        )
    ).scalar_one_or_none()
    assert old_ta is not None

    # Revoke audit with reason=email_changed, then a new promotion audit
    revokes = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    AuditLog.tenant_id == tenant_e.id,
                    AuditLog.action == AuditAction.OFFER_ATTENDEE_REVOKED,
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(revokes) == 1
    assert revokes[0].details.get("reason") == "email_changed"

    promos = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    AuditLog.tenant_id == tenant_e.id,
                    AuditLog.action == AuditAction.OFFER_ATTENDEE_PROMOTED,
                )
            )
        )
        .scalars()
        .all()
    )
    # One promotion on accept + one on email-change re-promote = 2
    assert len(promos) == 2


@pytest.mark.asyncio
async def test_name_only_change_post_accept_syncs_training_attendee(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_e: User,
    tenant_e: Tenant,
    accepted_offer_with_alice: tuple[str, str],
) -> None:
    """Name-only edit on an accepted attendee updates the linked TrainingAttendee's name."""
    token = _make_token(admin_e)
    offer_id, attendee_id = accepted_offer_with_alice

    resp = await client.put(
        f"{_attendees_url(offer_id)}/{attendee_id}",
        json={"first_name": "Alicia", "last_name": "Adamson"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.text

    ta = (
        await db_session.execute(
            select(TrainingAttendee).where(
                TrainingAttendee.tenant_id == tenant_e.id,
                TrainingAttendee.email_hash == hash_email("alice@example.com"),
            )
        )
    ).scalar_one()
    await db_session.refresh(ta)
    assert ta.first_name == "Alicia"
    assert ta.last_name == "Adamson"

    # No revoke audit on a name-only change
    revokes = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    AuditLog.tenant_id == tenant_e.id,
                    AuditLog.action == AuditAction.OFFER_ATTENDEE_REVOKED,
                )
            )
        )
        .scalars()
        .all()
    )
    assert revokes == []


@pytest.mark.asyncio
async def test_email_change_on_draft_offer_is_pure_update(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_e: User,
    tenant_e: Tenant,
    customer_e: Customer,
    placement_e: ProgramYearTraining,
) -> None:
    """Email edits on a draft offer should not create TrainingAttendees or fire audits."""
    token = _make_token(admin_e)
    offer_resp = await client.post(
        BASE_OFFERS,
        json={"customer_id": str(customer_e.id), "placement_ids": [str(placement_e.id)]},
        headers=auth_headers(token),
    )
    offer_id = offer_resp.json()["id"]
    att_resp = await client.post(
        _attendees_url(offer_id),
        json={
            "placement_id": str(placement_e.id),
            "first_name": "Draft",
            "last_name": "Attendee",
            "email": "d1@x.com",
        },
        headers=auth_headers(token),
    )
    attendee_id = att_resp.json()["id"]

    put_resp = await client.put(
        f"{_attendees_url(offer_id)}/{attendee_id}",
        json={"email": "d2@x.com"},
        headers=auth_headers(token),
    )
    assert put_resp.status_code == 200

    # No promotion or revoke audits from this path
    audits = (
        (
            await db_session.execute(
                select(AuditLog).where(
                    AuditLog.tenant_id == tenant_e.id,
                    AuditLog.action.in_(
                        [
                            AuditAction.OFFER_ATTENDEE_PROMOTED,
                            AuditAction.OFFER_ATTENDEE_REVOKED,
                        ]
                    ),
                )
            )
        )
        .scalars()
        .all()
    )
    assert audits == []

    # No TrainingAttendee was created for either email
    for email in ("d1@x.com", "d2@x.com"):
        ta = (
            await db_session.execute(
                select(TrainingAttendee).where(
                    TrainingAttendee.tenant_id == tenant_e.id,
                    TrainingAttendee.email_hash == hash_email(email),
                )
            )
        ).scalar_one_or_none()
        assert ta is None, f"Unexpected TrainingAttendee for {email} on draft offer"
