"""Tests for the tenant-level portal_users admin router.

Covers:
- list + detail + profile update (with linkage hints)
- toggle-access with training-side AND conference-side guardrails
- resend-invite, reset-password, impersonate (history + audit writes)
- merge (both training + conference linked records moved)
- history endpoint returns chronological events
"""

from __future__ import annotations

import os
import uuid
from datetime import date, timedelta
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

from app.core.security import create_access_token, hash_password
from app.models.audit import AuditAction, AuditLog
from app.models.cfp import CallForPapers
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper, PaperStatus
from app.models.conference import Conference
from app.models.location import Location
from app.models.portal_user import PortalUser
from app.models.portal_user_history import PortalUserHistory
from app.models.registration import Registration
from app.models.tenant import Tenant
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_program import ProgramYearTraining, TrainingProgramYear
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User, UserRole
from tests.conftest import auth_headers


def _make_token(user: User, modules: list[str] | None = None) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or ["trainings", "conferences"],
    )


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def tenant_pu(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name="PU Tenant",
        slug=f"pu-tenant-{uuid.uuid4().hex[:6]}",
        is_active=True,
        country="Germany",
        city="Berlin",
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def admin_pu(db_session: AsyncSession, tenant_pu: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant_pu.id,
        email=f"admin-pu-{uuid.uuid4().hex[:6]}@test.com",
        first_name="Admin",
        last_name="PU",
        role=UserRole.TENANT_ADMIN.value,
        password_hash=hash_password("Password123!"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


async def _make_portal_user(
    db_session: AsyncSession, tenant: Tenant, suffix: str = "", *, active: bool = True
) -> PortalUser:
    pu = PortalUser(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"pu-{suffix}-{uuid.uuid4().hex[:6]}@test.de",
        first_name="Port",
        last_name="User",
        is_active=active,
    )
    db_session.add(pu)
    await db_session.commit()
    return pu


async def _make_active_conference(db_session: AsyncSession, tenant: Tenant) -> Conference:
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="PU Conf",
        abbreviation="PUC",
        start_date=date.today() + timedelta(days=30),
        end_date=date.today() + timedelta(days=32),
        is_active=True,
    )
    db_session.add(c)
    await db_session.commit()
    return c


async def _make_registration_for(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    pu: PortalUser,
    *,
    status: str = "registered",
) -> Registration:
    from app.models.booking import BookingOption
    from app.models.registration import BillingProfile

    bp = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="Teststr 1",
        postal_code="10115",
        city="Berlin",
        country="DE",
        contact_first_name=pu.first_name,
        contact_last_name=pu.last_name,
    )
    db_session.add(bp)
    opt = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name=f"Opt-{uuid.uuid4().hex[:4]}",
        sort_order=1,
        is_active=True,
        attendance_type="in_person",
    )
    db_session.add(opt)
    await db_session.flush()
    reg = Registration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        billing_profile_id=bp.id,
        booking_option_id=opt.id,
        first_name=pu.first_name,
        last_name=pu.last_name,
        email=pu.email,
        email_hash=pu.email_hash,
        status=status,
    )
    db_session.add(reg)
    await db_session.commit()
    return reg


async def _make_cfp_paper_for(
    db_session: AsyncSession,
    tenant: Tenant,
    pu: PortalUser,
    *,
    paper_status: str = PaperStatus.SUBMITTED.value,
) -> tuple[CFPApplicant, CFPPaper]:
    applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name=pu.first_name,
        last_name=pu.last_name,
        email=pu.email,
        email_hash=pu.email_hash,
        password_hash=hash_password("Password123!"),
        portal_user_id=pu.id,
    )
    db_session.add(applicant)
    await db_session.flush()

    cfp = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="PU CFP",
        status="open",
    )
    db_session.add(cfp)
    await db_session.flush()

    paper = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title="Test paper",
        abstract_short="abs",
        status=paper_status,
    )
    db_session.add(paper)
    await db_session.commit()
    return applicant, paper


async def _make_training_placement(db_session: AsyncSession, tenant: Tenant) -> ProgramYearTraining:
    loc = Location(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name=f"Loc-{uuid.uuid4().hex[:4]}",
        city="Berlin",
        country="DE",
    )
    db_session.add(loc)
    tr = Training(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name=f"T-{uuid.uuid4().hex[:4]}",
        slug=f"t-{uuid.uuid4().hex[:6]}",
        abbreviation=f"T{uuid.uuid4().hex[:3]}",
        duration=3,
        regular_price=100.00,
        currency="EUR",
        is_active=True,
    )
    db_session.add(tr)
    py = TrainingProgramYear(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        year=date.today().year + 1,
        status="published",
    )
    db_session.add(py)
    await db_session.flush()
    placement = ProgramYearTraining(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_year_id=py.id,
        training_id=tr.id,
        location_id=loc.id,
        start_date=date.today() + timedelta(days=30),
        placement_type="open",
        is_active=True,
    )
    db_session.add(placement)
    await db_session.commit()
    return placement


# ── Listing + detail ───────────────────────────────────────────────────


class TestListing:
    @pytest.mark.asyncio
    async def test_list_returns_users_with_linkage_hints(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        pu = await _make_portal_user(db_session, tenant_pu, "list")
        await _make_cfp_paper_for(db_session, tenant_pu, pu)
        conf = await _make_active_conference(db_session, tenant_pu)
        await _make_registration_for(db_session, tenant_pu, conf, pu)

        token = _make_token(admin_pu)
        res = await client.get("/api/v1/portal-users", headers=auth_headers(token))
        assert res.status_code == 200

        data = res.json()
        item = next(i for i in data["items"] if i["id"] == str(pu.id))
        assert item["has_cfp_link"] is True
        assert item["has_registration_link"] is True

    @pytest.mark.asyncio
    async def test_detail_returns_linkage_counts(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        pu = await _make_portal_user(db_session, tenant_pu, "det")
        await _make_cfp_paper_for(db_session, tenant_pu, pu)
        conf = await _make_active_conference(db_session, tenant_pu)
        await _make_registration_for(db_session, tenant_pu, conf, pu)

        token = _make_token(admin_pu)
        res = await client.get(f"/api/v1/portal-users/{pu.id}", headers=auth_headers(token))
        assert res.status_code == 200

        linkages = res.json()["linkages"]
        assert linkages["cfp_applicant_count"] == 1
        assert linkages["registration_count"] == 1
        assert linkages["training_attendee_count"] == 0


# ── Toggle access ──────────────────────────────────────────────────────


class TestToggleAccess:
    @pytest.mark.asyncio
    async def test_deactivate_blocked_by_active_training(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        placement = await _make_training_placement(db_session, tenant_pu)
        pu = await _make_portal_user(db_session, tenant_pu, "tr")
        att = TrainingAttendee(
            id=uuid.uuid4(),
            tenant_id=tenant_pu.id,
            first_name="P",
            last_name="U",
            email=pu.email,
            status="active",
            portal_user_id=pu.id,
        )
        db_session.add(att)
        await db_session.flush()
        reg = TrainingRegistration(
            id=uuid.uuid4(),
            tenant_id=tenant_pu.id,
            placement_id=placement.id,
            status="registered",
            street="X",
            postal_code="1",
            city="B",
            country="DE",
            contact_first_name="P",
            contact_last_name="U",
            contact_email=pu.email,
        )
        db_session.add(reg)
        await db_session.flush()
        db_session.add(
            TrainingRegistrationAttendee(
                id=uuid.uuid4(),
                tenant_id=tenant_pu.id,
                registration_id=reg.id,
                attendee_id=att.id,
                first_name="P",
                last_name="U",
                email=pu.email,
            )
        )
        await db_session.commit()

        token = _make_token(admin_pu)
        res = await client.put(f"/api/v1/portal-users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 409
        assert "training" in res.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_deactivate_blocked_by_active_cfp_paper(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        pu = await _make_portal_user(db_session, tenant_pu, "cfp")
        await _make_cfp_paper_for(db_session, tenant_pu, pu, paper_status=PaperStatus.SUBMITTED.value)

        token = _make_token(admin_pu)
        res = await client.put(f"/api/v1/portal-users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 409
        assert "conference" in res.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_deactivate_blocked_by_active_registration(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        pu = await _make_portal_user(db_session, tenant_pu, "reg")
        conf = await _make_active_conference(db_session, tenant_pu)
        await _make_registration_for(db_session, tenant_pu, conf, pu)

        token = _make_token(admin_pu)
        res = await client.put(f"/api/v1/portal-users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 409
        assert "conference" in res.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_deactivate_allowed_when_registration_cancelled(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        pu = await _make_portal_user(db_session, tenant_pu, "regx")
        conf = await _make_active_conference(db_session, tenant_pu)
        await _make_registration_for(db_session, tenant_pu, conf, pu, status="cancelled")

        token = _make_token(admin_pu)
        res = await client.put(f"/api/v1/portal-users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 200
        assert res.json()["is_active"] is False

    @pytest.mark.asyncio
    async def test_deactivate_writes_history_and_audit(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        pu = await _make_portal_user(db_session, tenant_pu, "hist")
        token = _make_token(admin_pu)
        res = await client.put(f"/api/v1/portal-users/{pu.id}/toggle-access", headers=auth_headers(token))
        assert res.status_code == 200

        hist = (
            (await db_session.execute(select(PortalUserHistory).where(PortalUserHistory.portal_user_id == pu.id)))
            .scalars()
            .all()
        )
        assert any(h.event_type == "portal_deactivated" for h in hist)

        audits = (
            (
                await db_session.execute(
                    select(AuditLog).where(
                        AuditLog.action == AuditAction.PORTAL_USER_TOGGLE_ACCESS,
                        AuditLog.resource_id == pu.id,
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(audits) == 1
        assert audits[0].details["is_active"] is False


# ── Resend invite / reset password / impersonate ───────────────────────


class TestEmailActions:
    @pytest.mark.asyncio
    async def test_resend_invite_writes_history_and_audit(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        pu = await _make_portal_user(db_session, tenant_pu, "inv")
        token = _make_token(admin_pu)

        mock_send = AsyncMock()
        with patch("app.core.email.send_email", mock_send):
            res = await client.post(f"/api/v1/portal-users/{pu.id}/resend-invite", headers=auth_headers(token))
        assert res.status_code == 200
        mock_send.assert_awaited_once()

        hist = (
            (await db_session.execute(select(PortalUserHistory).where(PortalUserHistory.portal_user_id == pu.id)))
            .scalars()
            .all()
        )
        assert any(h.event_type == "invite_resent" for h in hist)

        audits = (
            (await db_session.execute(select(AuditLog).where(AuditLog.action == AuditAction.PORTAL_USER_RESEND_INVITE)))
            .scalars()
            .all()
        )
        assert any(a.resource_id == pu.id for a in audits)

    @pytest.mark.asyncio
    async def test_reset_password_writes_history(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        pu = await _make_portal_user(db_session, tenant_pu, "rst")
        token = _make_token(admin_pu)

        mock_send = AsyncMock()
        with patch("app.core.email.send_email", mock_send):
            res = await client.post(f"/api/v1/portal-users/{pu.id}/reset-password", headers=auth_headers(token))
        assert res.status_code == 200

        hist = (
            (await db_session.execute(select(PortalUserHistory).where(PortalUserHistory.portal_user_id == pu.id)))
            .scalars()
            .all()
        )
        assert any(h.event_type == "password_reset_sent" for h in hist)

    @pytest.mark.asyncio
    async def test_impersonate_returns_access_token_and_writes_history(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        pu = await _make_portal_user(db_session, tenant_pu, "imp")
        token = _make_token(admin_pu)

        res = await client.post(f"/api/v1/portal-users/{pu.id}/impersonate", headers=auth_headers(token))
        assert res.status_code == 200
        data = res.json()
        assert data["access_token"]
        assert data["portal_user_email"] == pu.email

        hist = (
            (await db_session.execute(select(PortalUserHistory).where(PortalUserHistory.portal_user_id == pu.id)))
            .scalars()
            .all()
        )
        assert any(h.event_type == "impersonated" for h in hist)

    @pytest.mark.asyncio
    async def test_impersonate_blocked_for_inactive_user(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        pu = await _make_portal_user(db_session, tenant_pu, "impoff", active=False)
        token = _make_token(admin_pu)

        res = await client.post(f"/api/v1/portal-users/{pu.id}/impersonate", headers=auth_headers(token))
        assert res.status_code == 422


# ── Merge ──────────────────────────────────────────────────────────────


class TestMerge:
    @pytest.mark.asyncio
    async def test_merge_moves_cfp_link_and_writes_history(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        target = await _make_portal_user(db_session, tenant_pu, "tgt")
        source = await _make_portal_user(db_session, tenant_pu, "src")
        applicant, _paper = await _make_cfp_paper_for(
            db_session, tenant_pu, source, paper_status=PaperStatus.ACCEPTED.value
        )

        token = _make_token(admin_pu)
        res = await client.post(
            f"/api/v1/portal-users/{target.id}/merge",
            headers=auth_headers(token),
            json={"source_user_id": str(source.id)},
        )
        assert res.status_code == 200
        assert res.json()["merged_records"] >= 1

        # CFP applicant re-linked.
        await db_session.refresh(applicant)
        assert applicant.portal_user_id == target.id

        # Source gone.
        src_exists = await db_session.execute(select(PortalUser).where(PortalUser.id == source.id))
        assert src_exists.scalar_one_or_none() is None

        # Target timeline carries a merged_into row.
        hist = (
            (await db_session.execute(select(PortalUserHistory).where(PortalUserHistory.portal_user_id == target.id)))
            .scalars()
            .all()
        )
        merged = [h for h in hist if h.event_type == "merged_into"]
        assert len(merged) == 1
        assert merged[0].meta["source_user_id"] == str(source.id)

    @pytest.mark.asyncio
    async def test_merge_rejects_same_user(
        self,
        client: AsyncClient,
        admin_pu: User,
        tenant_pu: Tenant,
        db_session: AsyncSession,
    ):
        pu = await _make_portal_user(db_session, tenant_pu, "self")
        token = _make_token(admin_pu)
        res = await client.post(
            f"/api/v1/portal-users/{pu.id}/merge",
            headers=auth_headers(token),
            json={"source_user_id": str(pu.id)},
        )
        assert res.status_code == 422


# ── History endpoint ───────────────────────────────────────────────────


class TestHistoryEndpoint:
    @pytest.mark.asyncio
    async def test_history_returns_events_newest_first(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        pu = await _make_portal_user(db_session, tenant_pu, "hist")
        token = _make_token(admin_pu)

        # Generate two events: deactivate then reactivate.
        await client.put(f"/api/v1/portal-users/{pu.id}/toggle-access", headers=auth_headers(token))
        await client.put(f"/api/v1/portal-users/{pu.id}/toggle-access", headers=auth_headers(token))

        res = await client.get(f"/api/v1/portal-users/{pu.id}/history", headers=auth_headers(token))
        assert res.status_code == 200
        items = res.json()["items"]
        assert len(items) == 2
        assert items[0]["event_type"] == "portal.activated"
        assert items[0]["domain"] == "portal"
        assert items[1]["event_type"] == "portal.deactivated"
        assert items[1]["domain"] == "portal"

    @pytest.mark.asyncio
    async def test_history_merges_training_attendee_events(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        """Training-side events (parked/registered/reassigned/etc.) appear
        next to admin actions on the unified history feed."""
        from app.models.customer_event import (
            ACTOR_ADMIN,
            DOMAIN_TRAINING,
            CustomerEventType,
        )
        from app.services.customer_event_service import CustomerEventService

        pu = await _make_portal_user(db_session, tenant_pu, "histmerge")
        attendee = TrainingAttendee(
            id=uuid.uuid4(),
            tenant_id=tenant_pu.id,
            portal_user_id=pu.id,
            first_name=pu.first_name,
            last_name=pu.last_name,
            email=pu.email,
            email_hash=pu.email_hash,
            status="parked",
        )
        db_session.add(attendee)
        await db_session.flush()

        assert pu.email_hash is not None
        for event_type, notes in (
            (CustomerEventType.TRAINING_REGISTERED, "Signed up through the portal"),
            (CustomerEventType.TRAINING_PARKED, "Training full"),
        ):
            CustomerEventService.record(
                db_session,
                tenant_id=tenant_pu.id,
                portal_user_id=pu.id,
                subject_email_hash=pu.email_hash,
                domain=DOMAIN_TRAINING,
                event_type=event_type,
                actor_kind=ACTOR_ADMIN,
                notes=notes,
                related_entity_type="training_attendee",
                related_entity_id=attendee.id,
            )
        await db_session.commit()

        token = _make_token(admin_pu)
        await client.put(f"/api/v1/portal-users/{pu.id}/toggle-access", headers=auth_headers(token))

        res = await client.get(f"/api/v1/portal-users/{pu.id}/history", headers=auth_headers(token))
        assert res.status_code == 200
        items = res.json()["items"]
        stream = {(i["domain"], i["event_type"]) for i in items}
        assert ("portal", "portal.deactivated") in stream
        assert ("training", "training.registered") in stream
        assert ("training", "training.parked") in stream

    @pytest.mark.asyncio
    async def test_history_resolves_merged_subject_via_email_hash(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        """After merge, the source portal_user is deleted; SET NULL nulls
        ``portal_user_id`` on its customer_events rows. The merged subject
        still has to show those events, resolved via ``subject_email_hash``."""
        from app.models.customer_event import (
            ACTOR_ADMIN,
            DOMAIN_TRAINING,
            CustomerEvent,
            CustomerEventType,
        )
        from app.services.customer_event_service import CustomerEventService

        pu = await _make_portal_user(db_session, tenant_pu, "histmerge2")
        assert pu.email_hash is not None

        # Write two events that are "unlinked" (portal_user_id is NULL) but
        # carry the same email_hash — simulating the post-merge state.
        for event_type in (CustomerEventType.TRAINING_REGISTERED, CustomerEventType.TRAINING_PARKED):
            CustomerEventService.record(
                db_session,
                tenant_id=tenant_pu.id,
                portal_user_id=None,
                subject_email_hash=pu.email_hash,
                domain=DOMAIN_TRAINING,
                event_type=event_type,
                actor_kind=ACTOR_ADMIN,
            )
        await db_session.commit()

        # Sanity: rows exist but are unlinked.
        unlinked = (
            (
                await db_session.execute(
                    select(CustomerEvent).where(
                        CustomerEvent.tenant_id == tenant_pu.id,
                        CustomerEvent.subject_email_hash == pu.email_hash,
                        CustomerEvent.portal_user_id.is_(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(unlinked) == 2

        token = _make_token(admin_pu)
        res = await client.get(f"/api/v1/portal-users/{pu.id}/history", headers=auth_headers(token))
        assert res.status_code == 200
        types = {i["event_type"] for i in res.json()["items"]}
        assert "training.registered" in types
        assert "training.parked" in types


# ── RLS isolation ──────────────────────────────────────────────────────


class TestTenantIsolation:
    @pytest.mark.asyncio
    async def test_cross_tenant_detail_returns_404(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        admin_pu: User,
        tenant_pu: Tenant,
    ):
        # Another tenant + portal user belonging to it.
        other = Tenant(
            id=uuid.uuid4(),
            name="Other",
            slug=f"other-{uuid.uuid4().hex[:6]}",
            is_active=True,
            country="DE",
            city="X",
        )
        db_session.add(other)
        await db_session.commit()

        foreign_pu = PortalUser(
            id=uuid.uuid4(),
            tenant_id=other.id,
            email=f"foreign-{uuid.uuid4().hex[:6]}@x.de",
            first_name="F",
            last_name="U",
            is_active=True,
        )
        db_session.add(foreign_pu)
        await db_session.commit()

        token = _make_token(admin_pu)  # admin of tenant_pu
        res = await client.get(f"/api/v1/portal-users/{foreign_pu.id}", headers=auth_headers(token))
        assert res.status_code == 404
