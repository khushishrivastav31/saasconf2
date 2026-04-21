"""Tests for dual-write of training events via ``CustomerEventService``.

Phase 4 of the unified customer architecture (see
``.claude/plans/smooth-sprouting-perlis.md``). Each training admin
endpoint that historically wrote a ``TrainingAttendeeHistory`` row must
now **also** append a ``customer_events`` row with the canonical
``training.*`` event_type, the attendee's ``email_hash`` as
``subject_email_hash``, and a ``related_entity_type="training_attendee"``
pointer.
"""

from __future__ import annotations

import os
import uuid
from datetime import date
from decimal import Decimal
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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.pii_crypto import hash_email
from app.models.customer import Customer
from app.models.customer_event import ACTOR_ADMIN, CustomerEvent
from app.models.customer_offer import CustomerOffer
from app.models.module import Module, TenantModule
from app.models.offer_attendee import OfferAttendee
from app.models.portal_user import PortalUser
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_attendee_history import TrainingAttendeeHistory
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User
from tests.conftest import _make_token, auth_headers

BASE = "/api/v1/trainings"


# ── Helpers ─────────────────────────────────────────────────────────────


async def _trainings_module(db: AsyncSession, tenant: Tenant) -> None:
    m = Module(id=uuid.uuid4(), name="Trainings", code="trainings", description="", is_active=True)
    db.add(m)
    await db.flush()
    db.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=m.id, is_enabled=True))
    await db.flush()


async def _make_placement(db: AsyncSession, tenant: Tenant, day: date) -> ProgramYearTraining:
    training = Training(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="T4 Training",
        slug=f"t4-{uuid.uuid4().hex[:6]}",
        regular_price=Decimal("500.00"),
    )
    db.add(training)
    await db.flush()
    year = TrainingProgramYear(id=uuid.uuid4(), tenant_id=tenant.id, year=day.year)
    db.add(year)
    await db.flush()
    placement = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_year_id=year.id,
        training_id=training.id,
        start_date=day,
        placement_type="open",
    )
    db.add(placement)
    await db.flush()
    return placement


async def _customer_events_for(
    db: AsyncSession, attendee_id: uuid.UUID, event_type: str | None = None
) -> list[CustomerEvent]:
    stmt = select(CustomerEvent).where(
        CustomerEvent.related_entity_type == "training_attendee",
        CustomerEvent.related_entity_id == attendee_id,
    )
    if event_type:
        stmt = stmt.where(CustomerEvent.event_type == event_type)
    res = await db.execute(stmt)
    return list(res.scalars().all())


# ── Fixtures ────────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def trainings_tenant(db_session: AsyncSession, tenant: Tenant) -> Tenant:
    await _trainings_module(db_session, tenant)
    await db_session.commit()
    return tenant


@pytest_asyncio.fixture()
async def admin_token(trainings_tenant: Tenant, tenant_admin_user: User) -> str:
    return _make_token(tenant_admin_user, modules=["trainings"])


@pytest_asyncio.fixture()
async def parked_attendee(db_session: AsyncSession, trainings_tenant: Tenant) -> TrainingAttendee:
    att = TrainingAttendee(
        id=uuid.uuid4(),
        tenant_id=trainings_tenant.id,
        first_name="Parked",
        last_name="Person",
        email=f"parked-{uuid.uuid4().hex[:6]}@test.com",
        status="parked",
    )
    db_session.add(att)
    await db_session.commit()
    await db_session.refresh(att)
    return att


# ── park / deactivate / reactivate ──────────────────────────────────────


class TestParkingDualWrite:
    @pytest.mark.asyncio
    async def test_park_attendee_writes_customer_event(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        trainings_tenant: Tenant,
        admin_token: str,
        tenant_admin_user: User,
    ):
        """POST /attendees/{id}/park → both tables; customer_events has ``training.parked``."""
        placement = await _make_placement(db_session, trainings_tenant, date(2026, 10, 1))

        registration = TrainingRegistration(
            id=uuid.uuid4(),
            tenant_id=trainings_tenant.id,
            placement_id=placement.id,
            status="confirmed",
            contact_first_name="Pat",
            contact_last_name="Park",
            contact_email="pat-park@test.com",
            street="X 1",
            postal_code="10001",
            city="Berlin",
            country="DE",
            payment_method="bank_transfer",
            subtotal=Decimal("500.00"),
            vat_amount=Decimal("95.00"),
            total=Decimal("595.00"),
            currency="EUR",
        )
        db_session.add(registration)
        await db_session.flush()

        att = TrainingAttendee(
            id=uuid.uuid4(),
            tenant_id=trainings_tenant.id,
            first_name="Pat",
            last_name="Park",
            email="pat-park@test.com",
            status="active",
        )
        db_session.add(att)
        await db_session.flush()

        ra = TrainingRegistrationAttendee(
            id=uuid.uuid4(),
            tenant_id=trainings_tenant.id,
            registration_id=registration.id,
            attendee_id=att.id,
            first_name="Pat",
            last_name="Park",
            email="pat-park@test.com",
        )
        db_session.add(ra)
        await db_session.commit()

        res = await client.post(
            f"{BASE}/attendees/{att.id}/park",
            json={"source_type": "registration", "source_id": str(ra.id), "reason": "Client postpone"},
            headers=auth_headers(admin_token),
        )
        assert res.status_code == 200, res.text

        legacy = (
            (
                await db_session.execute(
                    select(TrainingAttendeeHistory).where(
                        TrainingAttendeeHistory.attendee_id == att.id,
                        TrainingAttendeeHistory.event_type == "parked",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(legacy) == 1

        events = await _customer_events_for(db_session, att.id, "training.parked")
        assert len(events) == 1
        ev = events[0]
        assert ev.domain == "training"
        assert ev.actor_kind == ACTOR_ADMIN
        assert ev.created_by == tenant_admin_user.id
        assert ev.subject_email_hash == att.email_hash
        assert ev.meta is not None
        assert ev.meta["source_type"] == "registration"
        assert ev.meta["source_id"] == str(ra.id)
        assert ev.meta["placement_id"] == str(placement.id)

    @pytest.mark.asyncio
    async def test_park_by_source_registration_writes_customer_event(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        trainings_tenant: Tenant,
        admin_token: str,
    ):
        """POST /attendees/park-by-source creates the central attendee **and** the customer event."""
        placement = await _make_placement(db_session, trainings_tenant, date(2026, 11, 1))

        registration = TrainingRegistration(
            id=uuid.uuid4(),
            tenant_id=trainings_tenant.id,
            placement_id=placement.id,
            status="confirmed",
            contact_first_name="Src",
            contact_last_name="Park",
            contact_email="src-park@test.com",
            street="X 2",
            postal_code="10002",
            city="Berlin",
            country="DE",
            payment_method="bank_transfer",
            subtotal=Decimal("500.00"),
            vat_amount=Decimal("95.00"),
            total=Decimal("595.00"),
            currency="EUR",
        )
        db_session.add(registration)
        await db_session.flush()

        ra = TrainingRegistrationAttendee(
            id=uuid.uuid4(),
            tenant_id=trainings_tenant.id,
            registration_id=registration.id,
            first_name="Src",
            last_name="Park",
            email="src-park@test.com",
        )
        db_session.add(ra)
        await db_session.commit()

        res = await client.post(
            f"{BASE}/attendees/park-by-source",
            json={"source_type": "registration", "source_id": str(ra.id), "reason": "No-show"},
            headers=auth_headers(admin_token),
        )
        assert res.status_code == 200, res.text
        attendee_id = uuid.UUID(res.json()["id"])

        events = await _customer_events_for(db_session, attendee_id, "training.parked")
        assert len(events) == 1
        assert events[0].meta is not None
        assert events[0].meta["placement_id"] == str(placement.id)

    @pytest.mark.asyncio
    async def test_deactivate_parked_writes_customer_event(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_token: str,
        parked_attendee: TrainingAttendee,
    ):
        res = await client.post(
            f"{BASE}/attendees/{parked_attendee.id}/deactivate",
            json={},
            headers=auth_headers(admin_token),
        )
        assert res.status_code == 200, res.text

        events = await _customer_events_for(db_session, parked_attendee.id, "training.deactivated")
        assert len(events) == 1
        assert events[0].notes == "Deactivated from parking lot"

    @pytest.mark.asyncio
    async def test_reactivate_inactive_writes_customer_event(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_token: str,
        parked_attendee: TrainingAttendee,
    ):
        # Deactivate first via endpoint.
        r1 = await client.post(
            f"{BASE}/attendees/{parked_attendee.id}/deactivate",
            json={},
            headers=auth_headers(admin_token),
        )
        assert r1.status_code == 200

        r2 = await client.post(
            f"{BASE}/attendees/{parked_attendee.id}/reactivate",
            headers=auth_headers(admin_token),
        )
        assert r2.status_code == 200, r2.text

        events = await _customer_events_for(db_session, parked_attendee.id, "training.reactivated")
        assert len(events) == 1
        assert events[0].notes == "Attendee reactivated"


# ── reassign ────────────────────────────────────────────────────────────


class TestReassignDualWrite:
    @pytest.mark.asyncio
    async def test_reassign_writes_customer_event(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        trainings_tenant: Tenant,
        admin_token: str,
    ):
        placement = await _make_placement(db_session, trainings_tenant, date(2026, 12, 1))

        att = TrainingAttendee(
            id=uuid.uuid4(),
            tenant_id=trainings_tenant.id,
            first_name="Reass",
            last_name="Ignee",
            email="reass-ignee@test.com",
            status="parked",
        )
        db_session.add(att)
        await db_session.commit()

        with patch(
            "app.core.training_registration_emails.send_training_invoice_email",
            new_callable=AsyncMock,
        ):
            res = await client.post(
                f"{BASE}/attendees/{att.id}/reassign",
                json={"placement_id": str(placement.id)},
                headers=auth_headers(admin_token),
            )
        assert res.status_code == 200, res.text
        new_registration_id = res.json()["new_registration_id"]

        events = await _customer_events_for(db_session, att.id, "training.reassigned")
        assert len(events) == 1
        ev = events[0]
        assert ev.domain == "training"
        assert ev.meta is not None
        assert ev.meta["placement_id"] == str(placement.id)
        assert ev.meta["new_registration_id"] == new_registration_id


# ── backfill (registered / offer_assigned) ──────────────────────────────


class TestBackfillDualWrite:
    @pytest.mark.asyncio
    async def test_backfill_registration_writes_registered_event(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        trainings_tenant: Tenant,
        admin_token: str,
    ):
        placement = await _make_placement(db_session, trainings_tenant, date(2027, 1, 15))

        registration = TrainingRegistration(
            id=uuid.uuid4(),
            tenant_id=trainings_tenant.id,
            placement_id=placement.id,
            status="confirmed",
            contact_first_name="Back",
            contact_last_name="Fill",
            contact_email="bf-reg@test.com",
            street="Z 1",
            postal_code="20001",
            city="Hamburg",
            country="DE",
            payment_method="bank_transfer",
            subtotal=Decimal("500.00"),
            vat_amount=Decimal("95.00"),
            total=Decimal("595.00"),
            currency="EUR",
        )
        db_session.add(registration)
        await db_session.flush()

        ra = TrainingRegistrationAttendee(
            id=uuid.uuid4(),
            tenant_id=trainings_tenant.id,
            registration_id=registration.id,
            first_name="Back",
            last_name="Fill",
            email="bf-reg@test.com",
        )
        db_session.add(ra)
        await db_session.commit()

        res = await client.post(f"{BASE}/attendees/backfill", headers=auth_headers(admin_token))
        assert res.status_code == 200, res.text
        assert res.json()["created"] >= 1

        att = (
            await db_session.execute(
                select(TrainingAttendee).where(TrainingAttendee.email_hash == hash_email("bf-reg@test.com"))
            )
        ).scalar_one()
        events = await _customer_events_for(db_session, att.id, "training.registered")
        assert len(events) == 1
        assert events[0].meta is not None
        assert events[0].meta["placement_id"] == str(placement.id)
        assert events[0].meta["source_id"] == str(ra.id)

    @pytest.mark.asyncio
    async def test_backfill_offer_writes_offer_assigned_event(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        trainings_tenant: Tenant,
        admin_token: str,
    ):
        placement = await _make_placement(db_session, trainings_tenant, date(2027, 2, 15))

        customer = Customer(
            id=uuid.uuid4(),
            tenant_id=trainings_tenant.id,
            name=f"Cust {uuid.uuid4().hex[:6]}",
        )
        db_session.add(customer)
        await db_session.flush()
        offer = CustomerOffer(
            id=uuid.uuid4(),
            tenant_id=trainings_tenant.id,
            customer_id=customer.id,
            offer_number=f"OF-{uuid.uuid4().hex[:6]}",
            status="accepted",
        )
        db_session.add(offer)
        await db_session.flush()

        oa = OfferAttendee(
            id=uuid.uuid4(),
            tenant_id=trainings_tenant.id,
            offer_id=offer.id,
            placement_id=placement.id,
            first_name="Back",
            last_name="Offer",
            email="bf-offer@test.com",
        )
        db_session.add(oa)
        await db_session.commit()

        res = await client.post(f"{BASE}/attendees/backfill", headers=auth_headers(admin_token))
        assert res.status_code == 200, res.text

        att = (
            await db_session.execute(
                select(TrainingAttendee).where(TrainingAttendee.email_hash == hash_email("bf-offer@test.com"))
            )
        ).scalar_one()
        events = await _customer_events_for(db_session, att.id, "training.offer_assigned")
        assert len(events) == 1
        assert events[0].meta is not None
        assert events[0].meta["placement_id"] == str(placement.id)
        assert events[0].meta["source_id"] == str(oa.id)


# ── training-side user toggle-access ────────────────────────────────────


class TestTrainingToggleAccessDualWrite:
    @pytest.mark.asyncio
    async def test_deactivate_portal_writes_training_deactivated(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        trainings_tenant: Tenant,
        admin_token: str,
    ):
        """training-side toggle-access → TRAINING_DEACTIVATED customer_event per linked attendee."""
        pu = PortalUser(
            id=uuid.uuid4(),
            tenant_id=trainings_tenant.id,
            email=f"tpu-{uuid.uuid4().hex[:6]}@test.de",
            first_name="Toggle",
            last_name="User",
            is_active=True,
        )
        db_session.add(pu)
        await db_session.flush()

        att = TrainingAttendee(
            id=uuid.uuid4(),
            tenant_id=trainings_tenant.id,
            first_name="Toggle",
            last_name="Att",
            email=f"toggle-att-{uuid.uuid4().hex[:6]}@test.de",
            status="parked",
            portal_user_id=pu.id,
        )
        db_session.add(att)
        await db_session.commit()

        res = await client.put(
            f"{BASE}/users/{pu.id}/toggle-access",
            headers=auth_headers(admin_token),
        )
        assert res.status_code == 200, res.text
        assert res.json()["is_active"] is False

        events = await _customer_events_for(db_session, att.id, "training.deactivated")
        assert len(events) == 1
        assert events[0].notes == "Portal account deactivated"

    @pytest.mark.asyncio
    async def test_reactivate_portal_writes_training_reactivated(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        trainings_tenant: Tenant,
        admin_token: str,
    ):
        pu = PortalUser(
            id=uuid.uuid4(),
            tenant_id=trainings_tenant.id,
            email=f"tpu2-{uuid.uuid4().hex[:6]}@test.de",
            first_name="Toggle2",
            last_name="User",
            is_active=False,
        )
        db_session.add(pu)
        await db_session.flush()

        att = TrainingAttendee(
            id=uuid.uuid4(),
            tenant_id=trainings_tenant.id,
            first_name="Toggle2",
            last_name="Att",
            email=f"toggle-att2-{uuid.uuid4().hex[:6]}@test.de",
            status="parked",
            portal_user_id=pu.id,
        )
        db_session.add(att)
        await db_session.commit()

        res = await client.put(
            f"{BASE}/users/{pu.id}/toggle-access",
            headers=auth_headers(admin_token),
        )
        assert res.status_code == 200, res.text
        assert res.json()["is_active"] is True

        events = await _customer_events_for(db_session, att.id, "training.reactivated")
        assert len(events) == 1
        assert events[0].notes == "Portal account activated"
