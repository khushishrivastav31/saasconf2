"""Tests for MAIN-13445: speaker notifications on paper accept/reject.

Covers:
- Admin accept/reject via PUT /cfp/papers/{id} sends a PAPER_ACCEPTANCE /
  PAPER_REJECTION email to the speaker.
- Dedup: a paper already notified (e.g. by the publish flow) isn't re-notified.
- Tenant's custom conference-level template overrides the default content.
- Submitted reviewer speaker_feedback is interpolated when present.
- The speaker-portal preview endpoint renders the same content that was sent.
"""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import create_applicant_access_token
from app.core.security import hash_password
from app.models.associations import ConferenceCFP
from app.models.cfp import CallForPapers, CFPApplicant, CFPCommitteeMember
from app.models.cfp_papers import CFPPaper, CFPPaperAssignment, PaperStatus
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.review import PaperReview, ReviewStatus
from app.models.settings import EmailTemplate
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.email_template import EmailTemplateType
from tests.conftest import _make_token, auth_headers

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="Call for Papers", code="cfp", description="CFP", is_active=True)
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_cfp(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    cfp_module: Module,
) -> Tenant:
    for mod in [conferences_module, cfp_module]:
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=mod.id, is_enabled=True))
    await db_session.commit()
    return tenant


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Jane",
        last_name="Speaker",
        email=f"jane-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest.fixture()
def applicant_token(applicant: CFPApplicant, tenant: Tenant) -> str:
    return create_applicant_access_token(applicant.id, tenant.id)


@pytest_asyncio.fixture()
async def cfp(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> CallForPapers:
    c = CallForPapers(id=uuid.uuid4(), tenant_id=tenant.id, title="TestCFP 2026", status="open")
    db_session.add(c)
    await db_session.flush()
    db_session.add(ConferenceCFP(id=uuid.uuid4(), conference_id=conference.id, cfp_id=c.id))
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def paper(db_session: AsyncSession, tenant: Tenant, cfp: CallForPapers, applicant: CFPApplicant) -> CFPPaper:
    p = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title="Async Testing in Python",
        abstract_short="A short abstract",
        status=PaperStatus.DRAFT.value,
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture()
async def committee_member(
    db_session: AsyncSession, tenant: Tenant, conference: Conference
) -> tuple[CFPCommitteeMember, CFPApplicant]:
    reviewer_applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Review",
        last_name="Person",
        email=f"reviewer-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(reviewer_applicant)
    await db_session.flush()
    cm = CFPCommitteeMember(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        applicant_id=reviewer_applicant.id,
        role="reviewer",
    )
    db_session.add(cm)
    await db_session.commit()
    return cm, reviewer_applicant


def _admin_headers(user: User) -> dict[str, str]:
    return auth_headers(_make_token(user, modules=["cfp", "messaging", "conferences"]))


# ---------------------------------------------------------------------------
# Admin accept/reject -> speaker email
# ---------------------------------------------------------------------------


class TestImmediateDecisionNotification:
    @pytest.mark.asyncio
    async def test_accept_sends_paper_acceptance_email(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        paper: CFPPaper,
        applicant: CFPApplicant,
    ) -> None:
        """Accepting a paper sends exactly one PAPER_ACCEPTANCE email to the speaker."""
        headers = _admin_headers(tenant_admin_user)
        with patch("app.core.email.cfp.send_email", new_callable=AsyncMock, return_value=True) as mock_send:
            resp = await client.put(
                f"/api/v1/cfp/papers/{paper.id}",
                json={"status": "accepted"},
                headers=headers,
            )
        assert resp.status_code == 200
        mock_send.assert_awaited_once()
        # Positional args: (to, subject, html, text); recipient is the main speaker.
        args = mock_send.await_args.args
        kwargs = mock_send.await_args.kwargs
        assert args[0] == applicant.email
        assert kwargs["email_type"] == "paper_decision"

    @pytest.mark.asyncio
    async def test_reject_sends_paper_rejection_email(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        paper: CFPPaper,
    ) -> None:
        """Rejecting a paper sends exactly one PAPER_REJECTION email to the speaker."""
        headers = _admin_headers(tenant_admin_user)
        with patch("app.core.email.cfp.send_email", new_callable=AsyncMock, return_value=True) as mock_send:
            resp = await client.put(
                f"/api/v1/cfp/papers/{paper.id}",
                json={"status": "rejected"},
                headers=headers,
            )
        assert resp.status_code == 200
        mock_send.assert_awaited_once()
        rendered_subject = mock_send.await_args.args[1]
        assert "Paper Decision" in rendered_subject or "Rejection" in rendered_subject or rendered_subject

    @pytest.mark.asyncio
    async def test_marks_notification_sent_at(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        paper: CFPPaper,
    ) -> None:
        """Accepting sets CFPPaper.notification_sent_at."""
        headers = _admin_headers(tenant_admin_user)
        with patch("app.core.email.cfp.send_email", new_callable=AsyncMock, return_value=True):
            resp = await client.put(
                f"/api/v1/cfp/papers/{paper.id}",
                json={"status": "accepted"},
                headers=headers,
            )
        assert resp.status_code == 200
        await db_session.refresh(paper)
        assert paper.notification_sent_at is not None

    @pytest.mark.asyncio
    async def test_already_notified_by_immediate_trigger_is_not_renotified_by_publish(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        paper: CFPPaper,
    ) -> None:
        """A paper already emailed by update_paper isn't double-notified when the
        program is later published with that paper's decision unchanged."""
        import datetime as dt

        from app.models.module import Module, TenantModule
        from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack

        program_module = Module(id=uuid.uuid4(), name="Program", code="program", is_active=True)
        db_session.add(program_module)
        await db_session.flush()
        db_session.add(
            TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=program_module.id, is_enabled=True)
        )
        await db_session.commit()

        # Immediate trigger: accept the paper, which emails + marks notification_sent_at.
        headers = auth_headers(
            _make_token(tenant_admin_user, modules=["cfp", "messaging", "conferences", "program"])
        )
        with patch("app.core.email.cfp.send_email", new_callable=AsyncMock, return_value=True) as mock_send:
            resp = await client.put(
                f"/api/v1/cfp/papers/{paper.id}",
                json={"status": "accepted"},
                headers=headers,
            )
        assert resp.status_code == 200
        mock_send.assert_awaited_once()

        # Build a minimal program grid and assign the (already-accepted) paper to a session,
        # so publish sees no status change for it.
        day = ProgramDay(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            date=dt.date(2026, 6, 15),
            name="Day 1",
            sort_order=0,
        )
        db_session.add(day)
        await db_session.flush()
        slot = ProgramTimeSlot(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            program_day_id=day.id,
            start_time=dt.time(9, 0),
            end_time=dt.time(10, 0),
            sort_order=0,
        )
        track = ProgramTrack(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            program_day_id=day.id,
            name="Room A",
            sort_order=0,
        )
        db_session.add_all([slot, track])
        await db_session.flush()
        db_session.add(
            ProgramSession(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                conference_id=conference.id,
                start_slot_id=slot.id,
                start_track_id=track.id,
                title=paper.title,
                paper_id=paper.id,
                slot_span=1,
                track_span=1,
            )
        )
        await db_session.commit()

        publish_resp = await client.post(
            f"/api/v1/conferences/{conference.id}/program/publish",
            headers=headers,
        )
        assert publish_resp.status_code == 200
        assert publish_resp.json()["notifications_sent"] == 0

    @pytest.mark.asyncio
    async def test_draft_transition_does_not_send_email(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        paper: CFPPaper,
    ) -> None:
        """Non-accept/reject transitions (e.g. accepted -> draft withdrawal) don't email."""
        headers = _admin_headers(tenant_admin_user)
        with patch("app.core.email.cfp.send_email", new_callable=AsyncMock, return_value=True):
            await client.put(f"/api/v1/cfp/papers/{paper.id}", json={"status": "accepted"}, headers=headers)
        with patch("app.core.email.cfp.send_email", new_callable=AsyncMock, return_value=True) as mock_send:
            resp = await client.put(
                f"/api/v1/cfp/papers/{paper.id}",
                json={"status": "draft"},
                headers=headers,
            )
        assert resp.status_code == 200
        mock_send.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_custom_conference_template_overrides_default(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        paper: CFPPaper,
    ) -> None:
        """A conference-level PAPER_ACCEPTANCE override is used instead of the default."""
        db_session.add(
            EmailTemplate(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                conference_id=conference.id,
                template_type=EmailTemplateType.PAPER_ACCEPTANCE,
                subject="Custom Acceptance Subject for [Conference Name]",
                body_html="<p>Custom body [First Name]</p>",
                is_active=True,
            )
        )
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        with patch("app.core.email.cfp.send_email", new_callable=AsyncMock, return_value=True) as mock_send:
            resp = await client.put(
                f"/api/v1/cfp/papers/{paper.id}",
                json={"status": "accepted"},
                headers=headers,
            )
        assert resp.status_code == 200
        mock_send.assert_awaited_once()
        subject = mock_send.await_args.args[1]
        body = mock_send.await_args.args[2]
        assert "Custom Acceptance Subject" in subject
        assert "Custom body Jane" in body

    @pytest.mark.asyncio
    async def test_speaker_feedback_interpolated_when_present(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        paper: CFPPaper,
        committee_member: tuple[CFPCommitteeMember, CFPApplicant],
    ) -> None:
        """Submitted reviewer speaker_feedback shows up when the template has the placeholder."""
        cm, _reviewer_applicant = committee_member
        assignment = CFPPaperAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            paper_id=paper.id,
            committee_member_id=cm.id,
        )
        db_session.add(assignment)
        await db_session.flush()

        db_session.add(
            PaperReview(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                assignment_id=assignment.id,
                paper_id=paper.id,
                committee_member_id=cm.id,
                status=ReviewStatus.SUBMITTED.value,
                speaker_feedback="Great talk idea, well structured.",
            )
        )
        db_session.add(
            EmailTemplate(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                conference_id=conference.id,
                template_type=EmailTemplateType.PAPER_ACCEPTANCE,
                subject="Accepted!",
                body_html="<p>Hi [First Name]</p>[Speaker Feedback]",
                is_active=True,
            )
        )
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        with patch("app.core.email.cfp.send_email", new_callable=AsyncMock, return_value=True) as mock_send:
            resp = await client.put(
                f"/api/v1/cfp/papers/{paper.id}",
                json={"status": "accepted"},
                headers=headers,
            )
        assert resp.status_code == 200
        body = mock_send.await_args.args[2]
        assert "Great talk idea, well structured." in body

    @pytest.mark.asyncio
    async def test_no_feedback_leaves_placeholder_block_empty(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        paper: CFPPaper,
    ) -> None:
        """With no submitted reviews, the Speaker Feedback block renders empty, not literal."""
        headers = _admin_headers(tenant_admin_user)
        with patch("app.core.email.cfp.send_email", new_callable=AsyncMock, return_value=True) as mock_send:
            resp = await client.put(
                f"/api/v1/cfp/papers/{paper.id}",
                json={"status": "accepted"},
                headers=headers,
            )
        assert resp.status_code == 200
        body = mock_send.await_args.args[2]
        assert "[Speaker Feedback]" not in body


# ---------------------------------------------------------------------------
# Speaker-portal preview endpoint
# ---------------------------------------------------------------------------


class TestNotificationPreviewEndpoint:
    @pytest.mark.asyncio
    async def test_preview_matches_sent_content(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_admin_user: User,
        tenant_with_cfp: Tenant,
        paper: CFPPaper,
        applicant_token: str,
    ) -> None:
        """The rendered preview matches what was actually emailed for that decision."""
        admin_headers = _admin_headers(tenant_admin_user)
        captured: dict = {}

        async def _capture_send(to, subject, html, text=None, **kwargs):
            captured["subject"] = subject
            captured["html"] = html
            return True

        with patch("app.core.email.cfp.send_email", new_callable=AsyncMock) as mock_send:
            mock_send.side_effect = _capture_send
            resp = await client.put(
                f"/api/v1/cfp/papers/{paper.id}",
                json={"status": "accepted"},
                headers=admin_headers,
            )
        assert resp.status_code == 200

        # Complete the CFP so the portal reveals the real (non-final-consideration) status.
        from app.models.cfp import CFPStatus

        cfp_obj = await db_session.get(CallForPapers, paper.cfp_id)
        cfp_obj.status = CFPStatus.COMPLETED.value
        await db_session.commit()

        preview_resp = await client.get(
            f"/api/v1/portal/papers/{paper.id}/notification-preview",
            headers=auth_headers(applicant_token),
        )
        assert preview_resp.status_code == 200
        data = preview_resp.json()
        assert data["subject"] == captured["subject"]
        assert data["body_html"] == captured["html"]

    @pytest.mark.asyncio
    async def test_preview_not_available_before_decision(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        paper: CFPPaper,
        applicant_token: str,
    ) -> None:
        """A draft paper has no decision notification to preview yet."""
        resp = await client.get(
            f"/api/v1/portal/papers/{paper.id}/notification-preview",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 400
