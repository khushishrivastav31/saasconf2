"""Conference-side customer_events writers — CFP paper lifecycle, registration
lifecycle, and merge-with-company tracking.

Covers the Phase 2.6 slice of the unified customer architecture (see
``.claude/plans/smooth-sprouting-perlis.md``): after portal + training writers
were wired, these tests verify that conference-side admin actions also emit
``customer_events`` rows — including cospeaker fan-out on paper submit/accept
and booking/company metadata on registration events.
"""

from __future__ import annotations

import os
import uuid
from datetime import date, timedelta

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
from app.models.associations import ConferenceCFP
from app.models.booking import BookingOption
from app.models.cfp import CallForPapers
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper, CFPPaperCospeaker, PaperStatus
from app.models.conference import Conference
from app.models.customer_event import CustomerEvent
from app.models.module import Module, TenantModule
from app.models.portal_user import PortalUser
from app.models.registration import BillingProfile, Registration, RegistrationStatus
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import auth_headers


def _make_token(user: User, modules: list[str] | None = None) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or ["cfp", "conferences", "registration"],
    )


# ── Shared fixtures ─────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def cx_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name="CX Tenant",
        slug=f"cx-{uuid.uuid4().hex[:6]}",
        is_active=True,
        country="Germany",
        city="Berlin",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def cx_admin(db_session: AsyncSession, cx_tenant: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=cx_tenant.id,
        email=f"cx-admin-{uuid.uuid4().hex[:6]}@test.com",
        first_name="Admin",
        last_name="X",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


async def _enable_modules(db_session: AsyncSession, tenant: Tenant, codes: list[str]) -> None:
    for code in codes:
        m = Module(id=uuid.uuid4(), name=code.title(), code=code, description=code, is_active=True)
        db_session.add(m)
        await db_session.flush()
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=m.id, is_enabled=True))
    await db_session.commit()


@pytest_asyncio.fixture
async def cx_conference(db_session: AsyncSession, cx_tenant: Tenant) -> Conference:
    conf = Conference(
        id=uuid.uuid4(),
        tenant_id=cx_tenant.id,
        name="CX Conf 2026",
        abbreviation="CXC",
        start_date=date.today() + timedelta(days=30),
        end_date=date.today() + timedelta(days=32),
        is_active=True,
    )
    db_session.add(conf)
    await db_session.commit()
    return conf


@pytest_asyncio.fixture
async def cx_cfp(db_session: AsyncSession, cx_tenant: Tenant, cx_conference: Conference) -> CallForPapers:
    cfp = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=cx_tenant.id,
        title="CX CFP",
        status="open",
    )
    db_session.add(cfp)
    await db_session.flush()
    db_session.add(ConferenceCFP(id=uuid.uuid4(), conference_id=cx_conference.id, cfp_id=cfp.id))
    await db_session.commit()
    return cfp


async def _make_applicant(
    db_session: AsyncSession, tenant: Tenant, *, suffix: str, portal_user_id: uuid.UUID | None = None
) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name=f"A{suffix}",
        last_name="Speaker",
        email=f"{suffix}-{uuid.uuid4().hex[:6]}@speakers.test",
        password_hash=hash_password("Password123!"),
        portal_user_id=portal_user_id,
    )
    db_session.add(a)
    await db_session.commit()
    return a


async def _make_paper(
    db_session: AsyncSession,
    tenant: Tenant,
    cfp: CallForPapers,
    main_speaker: CFPApplicant,
    *,
    status: str = PaperStatus.DRAFT.value,
    cospeakers: list[CFPApplicant] | None = None,
    title: str = "Test Paper",
) -> CFPPaper:
    p = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=main_speaker.id,
        title=title,
        abstract_short="abstract",
        status=status,
    )
    db_session.add(p)
    await db_session.flush()
    for co in cospeakers or []:
        db_session.add(CFPPaperCospeaker(paper_id=p.id, applicant_id=co.id))
    await db_session.commit()
    return p


# ── CFP paper lifecycle ─────────────────────────────────────────────────


class TestCFPPaperEvents:
    @pytest.mark.asyncio
    async def test_submit_paper_records_event_for_main_speaker_and_cospeakers(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        cx_admin: User,
        cx_tenant: Tenant,
        cx_cfp: CallForPapers,
    ) -> None:
        await _enable_modules(db_session, cx_tenant, ["cfp", "conferences"])
        main = await _make_applicant(db_session, cx_tenant, suffix="main")
        co1 = await _make_applicant(db_session, cx_tenant, suffix="co1")
        co2 = await _make_applicant(db_session, cx_tenant, suffix="co2")
        paper = await _make_paper(
            db_session,
            cx_tenant,
            cx_cfp,
            main,
            cospeakers=[co1, co2],
            title="Submit me",
        )

        res = await client.post(
            f"/api/v1/cfp/papers/{paper.id}/submit",
            headers=auth_headers(_make_token(cx_admin)),
        )
        assert res.status_code == 200, res.text

        rows = (
            (
                await db_session.execute(
                    select(CustomerEvent).where(
                        CustomerEvent.related_entity_type == "cfp_paper",
                        CustomerEvent.related_entity_id == paper.id,
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 3  # main + 2 cospeakers
        assert {r.event_type for r in rows} == {"cfp.submitted"}
        assert {r.subject_email_hash for r in rows} == {
            main.email_hash,
            co1.email_hash,
            co2.email_hash,
        }
        for r in rows:
            assert r.domain == "cfp"
            assert r.meta is not None
            assert r.meta["paper_id"] == str(paper.id)
            assert r.meta["paper_title"] == "Submit me"
            assert r.meta["conference_name"] == "CX Conf 2026"

    @pytest.mark.asyncio
    async def test_update_status_to_accepted_records_cfp_accepted(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        cx_admin: User,
        cx_tenant: Tenant,
        cx_cfp: CallForPapers,
    ) -> None:
        await _enable_modules(db_session, cx_tenant, ["cfp", "conferences"])
        main = await _make_applicant(db_session, cx_tenant, suffix="accmain")
        co = await _make_applicant(db_session, cx_tenant, suffix="acccosp")
        paper = await _make_paper(
            db_session,
            cx_tenant,
            cx_cfp,
            main,
            status=PaperStatus.SUBMITTED.value,
            cospeakers=[co],
        )

        res = await client.put(
            f"/api/v1/cfp/papers/{paper.id}",
            json={"status": "accepted"},
            headers=auth_headers(_make_token(cx_admin)),
        )
        assert res.status_code == 200, res.text

        rows = (
            (
                await db_session.execute(
                    select(CustomerEvent).where(
                        CustomerEvent.related_entity_id == paper.id,
                        CustomerEvent.event_type == "cfp.accepted",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert {r.subject_email_hash for r in rows} == {main.email_hash, co.email_hash}

    @pytest.mark.asyncio
    async def test_update_status_to_rejected_records_cfp_rejected(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        cx_admin: User,
        cx_tenant: Tenant,
        cx_cfp: CallForPapers,
    ) -> None:
        await _enable_modules(db_session, cx_tenant, ["cfp", "conferences"])
        main = await _make_applicant(db_session, cx_tenant, suffix="rejmain")
        paper = await _make_paper(db_session, cx_tenant, cx_cfp, main, status=PaperStatus.SUBMITTED.value)

        res = await client.put(
            f"/api/v1/cfp/papers/{paper.id}",
            json={"status": "rejected"},
            headers=auth_headers(_make_token(cx_admin)),
        )
        assert res.status_code == 200

        rows = (
            (
                await db_session.execute(
                    select(CustomerEvent).where(
                        CustomerEvent.related_entity_id == paper.id,
                        CustomerEvent.event_type == "cfp.rejected",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1

    @pytest.mark.asyncio
    async def test_unsubmit_records_cfp_withdrawn(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        cx_admin: User,
        cx_tenant: Tenant,
        cx_cfp: CallForPapers,
    ) -> None:
        await _enable_modules(db_session, cx_tenant, ["cfp", "conferences"])
        main = await _make_applicant(db_session, cx_tenant, suffix="wmain")
        paper = await _make_paper(db_session, cx_tenant, cx_cfp, main, status=PaperStatus.SUBMITTED.value)

        res = await client.post(
            f"/api/v1/cfp/papers/{paper.id}/unsubmit",
            headers=auth_headers(_make_token(cx_admin)),
        )
        assert res.status_code == 200

        rows = (
            (
                await db_session.execute(
                    select(CustomerEvent).where(
                        CustomerEvent.related_entity_id == paper.id,
                        CustomerEvent.event_type == "cfp.withdrawn",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1


# ── Registration lifecycle ──────────────────────────────────────────────


class TestRegistrationEvents:
    @pytest.mark.asyncio
    async def test_create_registration_records_event_with_booking_and_company(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        cx_admin: User,
        cx_tenant: Tenant,
        cx_conference: Conference,
    ) -> None:
        await _enable_modules(db_session, cx_tenant, ["registration", "conferences"])
        opt = BookingOption(
            id=uuid.uuid4(),
            tenant_id=cx_tenant.id,
            conference_id=cx_conference.id,
            name="Full Conference",
            sort_order=1,
            is_active=True,
            attendance_type="in_person",
        )
        db_session.add(opt)
        await db_session.commit()

        payload = {
            "billing": {
                "company_name": "Acme GmbH",
                "street": "Hauptstr 1",
                "postal_code": "10115",
                "city": "Berlin",
                "country": "DE",
                "contact_first_name": "Max",
                "contact_last_name": "Muster",
                "contact_email": "billing@acme.example.com",
                "contact_phone": "+491701234567",
            },
            "attendees": [
                {
                    "first_name": "Alice",
                    "last_name": "Attendee",
                    "email": "alice@acme.example.com",
                    "booking_option_id": str(opt.id),
                }
            ],
        }
        res = await client.post(
            f"/api/v1/conferences/{cx_conference.id}/registrations",
            json=payload,
            headers=auth_headers(_make_token(cx_admin)),
        )
        assert res.status_code == 201, res.text

        rows = (
            (
                await db_session.execute(
                    select(CustomerEvent).where(
                        CustomerEvent.event_type == "registration.registered",
                        CustomerEvent.tenant_id == cx_tenant.id,
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        row = rows[0]
        assert row.domain == "registration"
        assert row.related_entity_type == "registration"
        assert row.meta is not None
        assert row.meta["conference_name"] == cx_conference.name
        assert row.meta["booking_option_name"] == "Full Conference"
        assert row.meta["company_name"] == "Acme GmbH"

    @pytest.mark.asyncio
    async def test_cancel_registration_records_event(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        cx_admin: User,
        cx_tenant: Tenant,
        cx_conference: Conference,
    ) -> None:
        await _enable_modules(db_session, cx_tenant, ["registration", "conferences"])
        bp = BillingProfile(
            id=uuid.uuid4(),
            tenant_id=cx_tenant.id,
            conference_id=cx_conference.id,
            company_name="Cancelled GmbH",
            street="X",
            postal_code="1",
            city="Berlin",
            country="DE",
            contact_first_name="M",
            contact_last_name="M",
        )
        db_session.add(bp)
        opt = BookingOption(
            id=uuid.uuid4(),
            tenant_id=cx_tenant.id,
            conference_id=cx_conference.id,
            name="Day Pass",
            sort_order=1,
            is_active=True,
            attendance_type="in_person",
        )
        db_session.add(opt)
        await db_session.flush()
        reg = Registration(
            id=uuid.uuid4(),
            tenant_id=cx_tenant.id,
            conference_id=cx_conference.id,
            billing_profile_id=bp.id,
            booking_option_id=opt.id,
            first_name="Carol",
            last_name="Cancel",
            email=f"carol-{uuid.uuid4().hex[:6]}@cancel.test",
            status=RegistrationStatus.INVOICED.value,
        )
        db_session.add(reg)
        await db_session.commit()

        res = await client.put(
            f"/api/v1/conferences/{cx_conference.id}/registrations/{reg.id}",
            json={"status": "cancelled"},
            headers=auth_headers(_make_token(cx_admin)),
        )
        assert res.status_code == 200, res.text

        rows = (
            (
                await db_session.execute(
                    select(CustomerEvent).where(
                        CustomerEvent.event_type == "registration.cancelled",
                        CustomerEvent.related_entity_id == reg.id,
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].meta is not None
        assert rows[0].meta["booking_option_name"] == "Day Pass"
        assert rows[0].meta["company_name"] == "Cancelled GmbH"
        assert rows[0].meta["conference_name"] == cx_conference.name


# ── Merge: capture company change ───────────────────────────────────────


class TestMergeCompanyMeta:
    @pytest.mark.asyncio
    async def test_merge_records_company_change_when_companies_differ(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        cx_admin: User,
        cx_tenant: Tenant,
    ) -> None:
        target = PortalUser(
            id=uuid.uuid4(),
            tenant_id=cx_tenant.id,
            email=f"tgt-{uuid.uuid4().hex[:6]}@merge.test",
            first_name="T",
            last_name="Target",
            company="NewCo",
            is_active=True,
        )
        source = PortalUser(
            id=uuid.uuid4(),
            tenant_id=cx_tenant.id,
            email=f"src-{uuid.uuid4().hex[:6]}@merge.test",
            first_name="S",
            last_name="Source",
            company="OldCo",
            is_active=True,
        )
        db_session.add_all([target, source])
        await db_session.commit()

        token = create_access_token(
            user_id=cx_admin.id,
            tenant_id=cx_admin.tenant_id,
            role=cx_admin.role,
            modules=["conferences", "trainings"],
        )
        res = await client.post(
            f"/api/v1/portal-users/{target.id}/merge",
            headers=auth_headers(token),
            json={"source_user_id": str(source.id)},
        )
        assert res.status_code == 200, res.text

        rows = (
            (
                await db_session.execute(
                    select(CustomerEvent).where(
                        CustomerEvent.portal_user_id == target.id,
                        CustomerEvent.event_type == "portal.merged_into",
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        meta = rows[0].meta
        assert meta is not None
        assert meta["source_company"] == "OldCo"
        assert meta["target_company"] == "NewCo"
        assert meta["company_changed"] is True

    @pytest.mark.asyncio
    async def test_merge_marks_company_unchanged_when_same(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        cx_admin: User,
        cx_tenant: Tenant,
    ) -> None:
        target = PortalUser(
            id=uuid.uuid4(),
            tenant_id=cx_tenant.id,
            email=f"tgt-{uuid.uuid4().hex[:6]}@merge.test",
            first_name="T",
            last_name="Target",
            company="SameCo",
            is_active=True,
        )
        source = PortalUser(
            id=uuid.uuid4(),
            tenant_id=cx_tenant.id,
            email=f"src-{uuid.uuid4().hex[:6]}@merge.test",
            first_name="S",
            last_name="Source",
            company="SameCo",
            is_active=True,
        )
        db_session.add_all([target, source])
        await db_session.commit()

        token = create_access_token(
            user_id=cx_admin.id,
            tenant_id=cx_admin.tenant_id,
            role=cx_admin.role,
            modules=["conferences", "trainings"],
        )
        res = await client.post(
            f"/api/v1/portal-users/{target.id}/merge",
            headers=auth_headers(token),
            json={"source_user_id": str(source.id)},
        )
        assert res.status_code == 200

        row = (
            await db_session.execute(
                select(CustomerEvent).where(
                    CustomerEvent.portal_user_id == target.id,
                    CustomerEvent.event_type == "portal.merged_into",
                )
            )
        ).scalar_one()
        assert row.meta is not None
        assert row.meta["company_changed"] is False
        assert row.meta["source_company"] == "SameCo"
        assert row.meta["target_company"] == "SameCo"
