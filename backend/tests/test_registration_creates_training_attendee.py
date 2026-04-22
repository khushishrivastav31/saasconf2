"""Regression coverage for the TrainingAttendee-unified-identity bug.

The public ``/portal/{slug}/trainings/register`` endpoint used to write
``TrainingRegistrationAttendee`` rows but never the unified
``TrainingAttendee`` identity. The missing identity row meant those
attendees were invisible in the admin Attendee list and in the portal
``/portal/unified/my-trainings`` view (which joins through
``TrainingAttendee.portal_user_id``).

These tests cover the shared helper + the backfill script that heals
data written before the forward fix landed.
The full HTTP registration flow is covered by
``tests/test_training_portal.py`` (which has the production-shaped
placement fixture).
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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.pii_crypto import hash_email
from app.core.training_attendee_resolver import resolve_or_create_training_attendee
from app.models.location import Location
from app.models.portal_user import PortalUser
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistrationAttendee

# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def tenant_r(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name="Registration Tenant",
        slug=f"reg-{uuid.uuid4().hex[:8]}",
        is_active=True,
        country="Germany",
        city="Berlin",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def placement_r(
    db_session: AsyncSession,
    tenant_r: Tenant,
) -> ProgramYearTraining:
    t = Training(
        id=uuid.uuid4(),
        tenant_id=tenant_r.id,
        name="Reg Training",
        slug="reg-training",
        duration=2,
        regular_price=1000,
        currency="EUR",
    )
    loc = Location(id=uuid.uuid4(), tenant_id=tenant_r.id, name="Berlin", code="BER", country="DE", city="Berlin")
    py = TrainingProgramYear(id=uuid.uuid4(), tenant_id=tenant_r.id, year=2026)
    db_session.add_all([t, loc, py])
    await db_session.commit()
    p = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant_r.id,
        program_year_id=py.id,
        training_id=t.id,
        start_date=date(2026, 11, 10),
        placement_type="open",
        location_id=loc.id,
        is_active=True,
    )
    db_session.add(p)
    await db_session.commit()
    return p


# ── Helper unit tests (direct) ────────────────────────────────────────


@pytest.mark.asyncio
async def test_resolve_or_create_helper_is_idempotent(
    db_session: AsyncSession,
    tenant_r: Tenant,
) -> None:
    """Calling the shared resolver twice with the same email yields the same row."""
    first = await resolve_or_create_training_attendee(
        db_session,
        tenant_id=tenant_r.id,
        email="idempotent@example.com",
        first_name="A",
        last_name="B",
    )
    await db_session.commit()
    second = await resolve_or_create_training_attendee(
        db_session,
        tenant_id=tenant_r.id,
        email="Idempotent@example.com",  # case-insensitive by design
        first_name="A",
        last_name="B",
    )
    await db_session.commit()
    assert first.id == second.id


@pytest.mark.asyncio
async def test_resolve_or_create_helper_rejects_empty_email(
    db_session: AsyncSession,
    tenant_r: Tenant,
) -> None:
    """Empty/whitespace email raises rather than silently creating a row."""
    with pytest.raises(ValueError, match="without an email"):
        await resolve_or_create_training_attendee(
            db_session,
            tenant_id=tenant_r.id,
            email="   ",
            first_name="A",
            last_name="B",
        )


# ── Backfill integration ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_backfill_creates_training_attendee_for_orphan_registration_attendee(
    db_session: AsyncSession,
    tenant_r: Tenant,
    placement_r: ProgramYearTraining,
) -> None:
    """The backfill script heals pre-fix TrainingRegistrationAttendee rows."""
    # Simulate pre-fix state: a registration attendee with no linked TrainingAttendee.
    from app.models.training_registration import TrainingRegistration

    reg = TrainingRegistration(
        id=uuid.uuid4(),
        tenant_id=tenant_r.id,
        placement_id=placement_r.id,
        status="paid",
        language="en",
        street="Main 1",
        postal_code="10117",
        city="Berlin",
        country="DE",
        contact_first_name="Orphan",
        contact_last_name="Row",
        contact_email="orphan@example.com",
        payment_method="bank_transfer",
    )
    db_session.add(reg)
    await db_session.flush()

    tra = TrainingRegistrationAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant_r.id,
        registration_id=reg.id,
        first_name="Orphan",
        last_name="Row",
        email="orphan@example.com",
        language="en",
    )
    # Manually clear the attendee_id so it starts as NULL
    db_session.add(tra)
    await db_session.commit()
    tra.attendee_id = None
    await db_session.commit()

    # Run the backfill for this tenant
    from scripts.backfill_training_attendees_from_registrations import backfill_tenant

    stats = await backfill_tenant(db_session, tenant_r.id)
    assert stats["scanned"] >= 1
    assert stats["linked_or_created"] >= 1

    # TrainingAttendee now exists and the registration attendee is linked.
    ta = (
        await db_session.execute(
            select(TrainingAttendee).where(
                TrainingAttendee.tenant_id == tenant_r.id,
                TrainingAttendee.email_hash == hash_email("orphan@example.com"),
            )
        )
    ).scalar_one()
    await db_session.refresh(tra)
    assert tra.attendee_id == ta.id


@pytest.mark.asyncio
async def test_backfill_links_existing_portal_user_to_training_attendee(
    db_session: AsyncSession,
    tenant_r: Tenant,
    placement_r: ProgramYearTraining,
) -> None:
    """The second pass links a TrainingAttendee to the PortalUser that already
    exists for the same email (e.g. created by a conference flow)."""
    # Pre-existing PortalUser (would have come from a conference path).
    pu = PortalUser(
        id=uuid.uuid4(),
        tenant_id=tenant_r.id,
        email="twohat@example.com",
        first_name="Two",
        last_name="Hat",
        is_active=True,
    )
    db_session.add(pu)
    await db_session.flush()

    # Pre-fix orphan registration
    from app.models.training_registration import TrainingRegistration

    reg = TrainingRegistration(
        id=uuid.uuid4(),
        tenant_id=tenant_r.id,
        placement_id=placement_r.id,
        status="paid",
        language="en",
        street="Main 2",
        postal_code="10117",
        city="Berlin",
        country="DE",
        contact_first_name="Two",
        contact_last_name="Hat",
        contact_email="twohat@example.com",
        payment_method="bank_transfer",
    )
    db_session.add(reg)
    await db_session.flush()
    tra = TrainingRegistrationAttendee(
        id=uuid.uuid4(),
        tenant_id=tenant_r.id,
        registration_id=reg.id,
        first_name="Two",
        last_name="Hat",
        email="twohat@example.com",
        language="en",
    )
    db_session.add(tra)
    await db_session.commit()

    from scripts.backfill_training_attendees_from_registrations import backfill_tenant

    stats = await backfill_tenant(db_session, tenant_r.id)
    assert stats["portal_user_links"] >= 1

    ta = (
        await db_session.execute(
            select(TrainingAttendee).where(
                TrainingAttendee.tenant_id == tenant_r.id,
                TrainingAttendee.email_hash == hash_email("twohat@example.com"),
            )
        )
    ).scalar_one()
    assert ta.portal_user_id == pu.id
