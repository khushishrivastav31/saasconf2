"""Tests for ``scripts/backfill_conference_customer_events.py``.

The backfill is one-shot and idempotent: it emits ``customer_events`` rows
for CFP papers and registrations that pre-date the live writers, keyed on
``(subject_email_hash, event_type, related_entity_id)`` so re-runs do not
double-insert.
"""

from __future__ import annotations

import os
import uuid
from datetime import UTC, date, datetime, timedelta

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

from app.core.security import hash_password
from app.models.associations import ConferenceCFP
from app.models.booking import BookingOption
from app.models.cfp import CallForPapers
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper, CFPPaperCospeaker, PaperStatus
from app.models.conference import Conference
from app.models.customer_event import CustomerEvent
from app.models.registration import BillingProfile, Registration, RegistrationStatus
from app.models.tenant import Tenant
from scripts.backfill_conference_customer_events import (
    _backfill_cfp_papers,
    _backfill_registrations,
)


@pytest_asyncio.fixture
async def bf_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name="BF Tenant",
        slug=f"bf-{uuid.uuid4().hex[:6]}",
        is_active=True,
        country="Germany",
        city="Berlin",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def bf_conference(db_session: AsyncSession, bf_tenant: Tenant) -> Conference:
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=bf_tenant.id,
        name="BF Conf",
        abbreviation="BFC",
        start_date=date.today() + timedelta(days=10),
        end_date=date.today() + timedelta(days=12),
        is_active=True,
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture
async def bf_cfp(db_session: AsyncSession, bf_tenant: Tenant, bf_conference: Conference) -> CallForPapers:
    cfp = CallForPapers(id=uuid.uuid4(), tenant_id=bf_tenant.id, title="BF CFP", status="open")
    db_session.add(cfp)
    await db_session.flush()
    db_session.add(ConferenceCFP(id=uuid.uuid4(), conference_id=bf_conference.id, cfp_id=cfp.id))
    await db_session.commit()
    return cfp


async def _applicant(db: AsyncSession, tenant: Tenant, suffix: str) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name=f"A{suffix}",
        last_name="Speaker",
        email=f"{suffix}-{uuid.uuid4().hex[:6]}@bf.test",
        password_hash=hash_password("Password123!"),
    )
    db.add(a)
    await db.commit()
    return a


async def _paper(
    db: AsyncSession,
    tenant: Tenant,
    cfp: CallForPapers,
    main: CFPApplicant,
    *,
    status: str,
    submitted_at: datetime | None,
    cospeakers: list[CFPApplicant] | None = None,
    title: str = "BF Paper",
) -> CFPPaper:
    p = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=main.id,
        title=title,
        abstract_short="abs",
        status=status,
        submitted_at=submitted_at,
    )
    db.add(p)
    await db.flush()
    for co in cospeakers or []:
        db.add(CFPPaperCospeaker(paper_id=p.id, applicant_id=co.id))
    await db.commit()
    return p


class TestCFPPaperBackfill:
    @pytest.mark.asyncio
    async def test_accepted_paper_emits_submitted_and_accepted_for_main_and_cospeakers(
        self,
        db_session: AsyncSession,
        bf_tenant: Tenant,
        bf_cfp: CallForPapers,
    ) -> None:
        main = await _applicant(db_session, bf_tenant, "mn")
        co = await _applicant(db_session, bf_tenant, "co")
        submitted_at = datetime.now(tz=UTC) - timedelta(days=7)
        await _paper(
            db_session,
            bf_tenant,
            bf_cfp,
            main,
            status=PaperStatus.ACCEPTED.value,
            submitted_at=submitted_at,
            cospeakers=[co],
        )

        stats = await _backfill_cfp_papers(db_session, bf_tenant.id)
        await db_session.commit()

        assert stats["papers_scanned"] == 1
        # 2 events (submitted + accepted) x 2 speakers = 4 rows
        assert stats["events_inserted"] == 4

        rows = (
            (await db_session.execute(select(CustomerEvent).where(CustomerEvent.tenant_id == bf_tenant.id)))
            .scalars()
            .all()
        )
        event_types = {r.event_type for r in rows}
        assert event_types == {"cfp.submitted", "cfp.accepted"}
        assert {r.subject_email_hash for r in rows} == {main.email_hash, co.email_hash}
        for r in rows:
            assert r.domain == "cfp"
            assert r.related_entity_type == "cfp_paper"
            assert r.meta is not None
            assert r.meta["conference_name"] == "BF Conf"

    @pytest.mark.asyncio
    async def test_rejected_paper_emits_submitted_and_rejected(
        self,
        db_session: AsyncSession,
        bf_tenant: Tenant,
        bf_cfp: CallForPapers,
    ) -> None:
        main = await _applicant(db_session, bf_tenant, "rj")
        await _paper(
            db_session,
            bf_tenant,
            bf_cfp,
            main,
            status=PaperStatus.REJECTED.value,
            submitted_at=datetime.now(tz=UTC) - timedelta(days=5),
        )

        await _backfill_cfp_papers(db_session, bf_tenant.id)
        await db_session.commit()

        rows = (
            (await db_session.execute(select(CustomerEvent).where(CustomerEvent.tenant_id == bf_tenant.id)))
            .scalars()
            .all()
        )
        assert {r.event_type for r in rows} == {"cfp.submitted", "cfp.rejected"}

    @pytest.mark.asyncio
    async def test_pure_draft_paper_is_skipped(
        self,
        db_session: AsyncSession,
        bf_tenant: Tenant,
        bf_cfp: CallForPapers,
    ) -> None:
        main = await _applicant(db_session, bf_tenant, "dr")
        await _paper(
            db_session,
            bf_tenant,
            bf_cfp,
            main,
            status=PaperStatus.DRAFT.value,
            submitted_at=None,
        )

        stats = await _backfill_cfp_papers(db_session, bf_tenant.id)
        await db_session.commit()

        assert stats["papers_scanned"] == 1
        assert stats["events_inserted"] == 0

    @pytest.mark.asyncio
    async def test_rerun_is_idempotent(
        self,
        db_session: AsyncSession,
        bf_tenant: Tenant,
        bf_cfp: CallForPapers,
    ) -> None:
        main = await _applicant(db_session, bf_tenant, "id")
        await _paper(
            db_session,
            bf_tenant,
            bf_cfp,
            main,
            status=PaperStatus.ACCEPTED.value,
            submitted_at=datetime.now(tz=UTC) - timedelta(days=3),
        )

        await _backfill_cfp_papers(db_session, bf_tenant.id)
        await db_session.commit()
        first = (
            (await db_session.execute(select(CustomerEvent).where(CustomerEvent.tenant_id == bf_tenant.id)))
            .scalars()
            .all()
        )

        stats2 = await _backfill_cfp_papers(db_session, bf_tenant.id)
        await db_session.commit()
        second = (
            (await db_session.execute(select(CustomerEvent).where(CustomerEvent.tenant_id == bf_tenant.id)))
            .scalars()
            .all()
        )

        assert stats2["events_inserted"] == 0
        assert stats2["events_skipped"] == len(first)
        assert len(second) == len(first)


class TestRegistrationBackfill:
    @pytest.mark.asyncio
    async def test_registered_and_cancelled_events_for_cancelled_registration(
        self,
        db_session: AsyncSession,
        bf_tenant: Tenant,
        bf_conference: Conference,
    ) -> None:
        bp = BillingProfile(
            id=uuid.uuid4(),
            tenant_id=bf_tenant.id,
            conference_id=bf_conference.id,
            company_name="Acme GmbH",
            street="S",
            postal_code="1",
            city="Berlin",
            country="DE",
            contact_first_name="M",
            contact_last_name="M",
        )
        opt = BookingOption(
            id=uuid.uuid4(),
            tenant_id=bf_tenant.id,
            conference_id=bf_conference.id,
            name="Full Conference",
            sort_order=1,
            is_active=True,
            attendance_type="in_person",
        )
        db_session.add_all([bp, opt])
        await db_session.flush()
        reg = Registration(
            id=uuid.uuid4(),
            tenant_id=bf_tenant.id,
            conference_id=bf_conference.id,
            billing_profile_id=bp.id,
            booking_option_id=opt.id,
            first_name="Alice",
            last_name="A",
            email=f"alice-{uuid.uuid4().hex[:6]}@acme.example.com",
            status=RegistrationStatus.CANCELLED.value,
        )
        db_session.add(reg)
        await db_session.commit()

        stats = await _backfill_registrations(db_session, bf_tenant.id)
        await db_session.commit()

        assert stats["events_inserted"] == 2
        rows = (
            (await db_session.execute(select(CustomerEvent).where(CustomerEvent.related_entity_id == reg.id)))
            .scalars()
            .all()
        )
        assert {r.event_type for r in rows} == {"registration.registered", "registration.cancelled"}
        for r in rows:
            assert r.meta is not None
            assert r.meta["booking_option_name"] == "Full Conference"
            assert r.meta["company_name"] == "Acme GmbH"
            assert r.meta["conference_name"] == bf_conference.name

    @pytest.mark.asyncio
    async def test_paid_registration_emits_only_registered(
        self,
        db_session: AsyncSession,
        bf_tenant: Tenant,
        bf_conference: Conference,
    ) -> None:
        bp = BillingProfile(
            id=uuid.uuid4(),
            tenant_id=bf_tenant.id,
            conference_id=bf_conference.id,
            company_name="Paid GmbH",
            street="S",
            postal_code="1",
            city="Berlin",
            country="DE",
            contact_first_name="M",
            contact_last_name="M",
        )
        opt = BookingOption(
            id=uuid.uuid4(),
            tenant_id=bf_tenant.id,
            conference_id=bf_conference.id,
            name="Day Pass",
            sort_order=1,
            is_active=True,
            attendance_type="in_person",
        )
        db_session.add_all([bp, opt])
        await db_session.flush()
        reg = Registration(
            id=uuid.uuid4(),
            tenant_id=bf_tenant.id,
            conference_id=bf_conference.id,
            billing_profile_id=bp.id,
            booking_option_id=opt.id,
            first_name="Bob",
            last_name="B",
            email=f"bob-{uuid.uuid4().hex[:6]}@paid.example.com",
            status=RegistrationStatus.PAID.value,
        )
        db_session.add(reg)
        await db_session.commit()

        await _backfill_registrations(db_session, bf_tenant.id)
        await db_session.commit()

        rows = (
            (await db_session.execute(select(CustomerEvent).where(CustomerEvent.related_entity_id == reg.id)))
            .scalars()
            .all()
        )
        assert {r.event_type for r in rows} == {"registration.registered"}
