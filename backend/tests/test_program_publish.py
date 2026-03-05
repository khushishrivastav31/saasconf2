"""Tests for program publication workflow.

Covers:
- Publish preview (dry run)
- Publish: paper status updates, CFP status, consolidated notifications
- Update: differential notifications for changes after initial publish
- Sessions export (CSV download)
- Co-speaker notification consolidation
- Speaker with mixed results (some accepted, some rejected)
"""

import uuid
from datetime import UTC, date, datetime, time

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.associations import ConferenceCFP
from app.models.cfp import (
    CallForPapers,
    CFPApplicant,
    CFPPaper,
    CFPPaperCospeaker,
    CFPStatus,
    PaperStatus,
)
from app.models.conference import Conference
from app.models.messaging import Message, MessageParticipant, MessageThread
from app.models.module import Module, TenantModule
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import auth_headers

# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User, modules: list[str] | None = None) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="Pub Corp", slug=f"pub-corp-{uuid.uuid4().hex[:8]}", is_active=True)
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def conference(db_session: AsyncSession, tenant: Tenant) -> Conference:
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="PubConf 2026",
        abbreviation="PC26",
        is_active=True,
        start_date=date(2026, 6, 15),
        end_date=date(2026, 6, 17),
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def admin_user(db_session: AsyncSession, tenant: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"admin-pub-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Admin",
        last_name="Pub",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture()
def admin_token(admin_user: User) -> str:
    return _make_token(admin_user, modules=["program", "cfp"])


@pytest_asyncio.fixture()
async def modules(db_session: AsyncSession, tenant: Tenant) -> list[Module]:
    """Create required modules and link to tenant."""
    mods = []
    for code in ("program", "cfp"):
        m = Module(id=uuid.uuid4(), name=code.upper(), code=code, is_active=True)
        db_session.add(m)
        mods.append(m)
    await db_session.flush()
    for m in mods:
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=m.id, is_enabled=True))
    await db_session.commit()
    return mods


@pytest_asyncio.fixture()
async def cfp(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> CallForPapers:
    """Create a CFP linked to the conference."""
    c = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="Main CFP",
        status=CFPStatus.REVIEW.value,
    )
    db_session.add(c)
    await db_session.flush()
    db_session.add(ConferenceCFP(id=uuid.uuid4(), conference_id=conference.id, cfp_id=c.id))
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def speakers(db_session: AsyncSession, tenant: Tenant) -> list[CFPApplicant]:
    """Create 3 speakers: Alice, Bob, Carol."""
    result = []
    for fname, lname, email in [
        ("Alice", "Smith", f"alice-{uuid.uuid4().hex[:6]}@test.com"),
        ("Bob", "Jones", f"bob-{uuid.uuid4().hex[:6]}@test.com"),
        ("Carol", "Lee", f"carol-{uuid.uuid4().hex[:6]}@test.com"),
    ]:
        a = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            first_name=fname,
            last_name=lname,
            email=email,
            password_hash=hash_password("Password123!"),
        )
        db_session.add(a)
        result.append(a)
    await db_session.commit()
    return result


@pytest_asyncio.fixture()
async def papers(
    db_session: AsyncSession, tenant: Tenant, cfp: CallForPapers, speakers: list[CFPApplicant]
) -> list[CFPPaper]:
    """Create 4 submitted papers:
    - Paper1 by Alice (will be accepted)
    - Paper2 by Alice (will be rejected)
    - Paper3 by Bob (will be accepted)
    - Paper4 by Carol (will be rejected)
    """
    alice, bob, carol = speakers
    result = []
    for title, speaker in [
        ("Paper 1: ML Trends", alice),
        ("Paper 2: Cloud Patterns", alice),
        ("Paper 3: DevOps Pipeline", bob),
        ("Paper 4: Security Best Practices", carol),
    ]:
        p = CFPPaper(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            cfp_id=cfp.id,
            main_speaker_id=speaker.id,
            title=title,
            status=PaperStatus.SUBMITTED.value,
            submitted_at=datetime.now(UTC),
        )
        db_session.add(p)
        result.append(p)
    await db_session.commit()
    return result


@pytest_asyncio.fixture()
async def program_grid(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> dict:
    """Create a minimal program grid: 1 day, 2 slots, 2 tracks."""
    day = ProgramDay(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        date=date(2026, 6, 15),
        name="Day 1",
        sort_order=0,
    )
    db_session.add(day)
    await db_session.flush()

    slot1 = ProgramTimeSlot(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_day_id=day.id,
        start_time=time(9, 0),
        end_time=time(10, 0),
        sort_order=0,
    )
    slot2 = ProgramTimeSlot(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_day_id=day.id,
        start_time=time(10, 0),
        end_time=time(11, 0),
        sort_order=1,
    )
    db_session.add_all([slot1, slot2])
    await db_session.flush()

    track1 = ProgramTrack(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        program_day_id=day.id,
        name="Room A",
        sort_order=0,
    )
    track2 = ProgramTrack(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        program_day_id=day.id,
        name="Room B",
        sort_order=1,
    )
    db_session.add_all([track1, track2])
    await db_session.commit()

    return {"day": day, "slots": [slot1, slot2], "tracks": [track1, track2]}


@pytest_asyncio.fixture()
async def sessions_with_papers(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    program_grid: dict,
    papers: list[CFPPaper],
) -> list[ProgramSession]:
    """Create 2 sessions, assigning papers[0] and papers[2] (Alice's Paper1 and Bob's Paper3).
    Papers[1] and papers[3] remain unassigned (will be rejected)."""
    slots = program_grid["slots"]
    tracks = program_grid["tracks"]

    s1 = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        start_slot_id=slots[0].id,
        start_track_id=tracks[0].id,
        title=papers[0].title,
        paper_id=papers[0].id,
        slot_span=1,
        track_span=1,
    )
    s2 = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        start_slot_id=slots[0].id,
        start_track_id=tracks[1].id,
        title=papers[2].title,
        paper_id=papers[2].id,
        slot_span=1,
        track_span=1,
    )
    db_session.add_all([s1, s2])
    await db_session.commit()
    return [s1, s2]


# ── Publish Preview Tests ──────────────────────────────────────────────


class TestPublishPreview:
    """Tests for GET /conferences/{id}/program/publish/preview."""

    @pytest.mark.asyncio
    async def test_preview_returns_correct_counts(
        self,
        client: AsyncClient,
        conference: Conference,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
    ):
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/program/publish/preview",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["papers_to_accept"] == 2  # papers[0], papers[2]
        assert data["papers_to_reject"] == 2  # papers[1], papers[3]
        assert data["already_published"] is False

    @pytest.mark.asyncio
    async def test_preview_lists_correct_papers(
        self,
        client: AsyncClient,
        conference: Conference,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
    ):
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/program/publish/preview",
            headers=auth_headers(admin_token),
        )
        data = resp.json()
        accepted_titles = {p["title"] for p in data["accepted_papers"]}
        rejected_titles = {p["title"] for p in data["rejected_papers"]}
        assert papers[0].title in accepted_titles
        assert papers[2].title in accepted_titles
        assert papers[1].title in rejected_titles
        assert papers[3].title in rejected_titles

    @pytest.mark.asyncio
    async def test_preview_shows_already_published(
        self,
        client: AsyncClient,
        conference: Conference,
        db_session: AsyncSession,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
    ):
        # Mark as previously published
        conference.program_published_at = datetime.now(UTC)
        await db_session.commit()

        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/program/publish/preview",
            headers=auth_headers(admin_token),
        )
        assert resp.json()["already_published"] is True

    @pytest.mark.asyncio
    async def test_preview_speakers_to_notify_includes_all_unique(
        self,
        client: AsyncClient,
        conference: Conference,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
        speakers,
    ):
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/program/publish/preview",
            headers=auth_headers(admin_token),
        )
        data = resp.json()
        # 3 speakers: Alice (accepted+rejected), Bob (accepted), Carol (rejected)
        assert data["speakers_to_notify"] == 3


# ── Publish Tests ──────────────────────────────────────────────────────


class TestPublishProgram:
    """Tests for POST /conferences/{id}/program/publish."""

    @pytest.mark.asyncio
    async def test_publish_updates_paper_statuses(
        self,
        client: AsyncClient,
        conference: Conference,
        db_session: AsyncSession,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
    ):
        # Capture IDs before API call (avoids lazy-load after expire)
        accepted_ids = {papers[0].id, papers[2].id}
        all_ids = [p.id for p in papers]

        resp = await client.post(
            f"/api/v1/conferences/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["papers_accepted"] == 2
        assert data["papers_rejected"] == 2

        # Verify paper statuses in DB with fresh queries
        for pid in all_ids:
            result = await db_session.execute(select(CFPPaper.status).where(CFPPaper.id == pid))
            status = result.scalar_one()
            if pid in accepted_ids:
                assert status == PaperStatus.ACCEPTED.value
            else:
                assert status == PaperStatus.REJECTED.value

    @pytest.mark.asyncio
    async def test_publish_sets_cfp_completed(
        self,
        client: AsyncClient,
        conference: Conference,
        db_session: AsyncSession,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
        cfp: CallForPapers,
    ):
        cfp_id = cfp.id
        await client.post(
            f"/api/v1/conferences/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )
        result = await db_session.execute(select(CallForPapers.status).where(CallForPapers.id == cfp_id))
        assert result.scalar_one() == CFPStatus.COMPLETED.value

    @pytest.mark.asyncio
    async def test_publish_sets_program_published_at(
        self,
        client: AsyncClient,
        conference: Conference,
        db_session: AsyncSession,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
    ):
        conf_id = conference.id
        resp = await client.post(
            f"/api/v1/conferences/{conf_id}/program/publish",
            headers=auth_headers(admin_token),
        )
        data = resp.json()
        assert data["published_at"] is not None

        result = await db_session.execute(select(Conference.program_published_at).where(Conference.id == conf_id))
        assert result.scalar_one() is not None

    @pytest.mark.asyncio
    async def test_publish_sends_consolidated_notifications(
        self,
        client: AsyncClient,
        conference: Conference,
        db_session: AsyncSession,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
        speakers,
    ):
        resp = await client.post(
            f"/api/v1/conferences/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )
        data = resp.json()
        assert data["notifications_sent"] > 0

        # Check message threads were created
        result = await db_session.execute(
            select(MessageThread).where(
                MessageThread.conference_id == conference.id,
                MessageThread.bulk_id.isnot(None),
            )
        )
        threads = result.scalars().all()
        assert len(threads) > 0

    @pytest.mark.asyncio
    async def test_publish_speaker_with_mixed_results_gets_two_messages(
        self,
        client: AsyncClient,
        conference: Conference,
        db_session: AsyncSession,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
        speakers,
    ):
        """Alice has Paper1 (accepted) and Paper2 (rejected) - should get 2 threads."""
        alice = speakers[0]
        await client.post(
            f"/api/v1/conferences/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )

        # Count threads where Alice is a participant
        result = await db_session.execute(
            select(MessageParticipant).where(
                MessageParticipant.participant_type == "applicant",
                MessageParticipant.participant_id == alice.id,
            )
        )
        alice_threads = result.scalars().all()
        assert len(alice_threads) == 2  # One acceptance + one rejection

    @pytest.mark.asyncio
    async def test_publish_single_result_speaker_gets_one_message(
        self,
        client: AsyncClient,
        conference: Conference,
        db_session: AsyncSession,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
        speakers,
    ):
        """Bob has only Paper3 (accepted) - should get 1 thread."""
        bob = speakers[1]
        await client.post(
            f"/api/v1/conferences/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )

        result = await db_session.execute(
            select(MessageParticipant).where(
                MessageParticipant.participant_type == "applicant",
                MessageParticipant.participant_id == bob.id,
            )
        )
        bob_threads = result.scalars().all()
        assert len(bob_threads) == 1

    @pytest.mark.asyncio
    async def test_publish_notification_body_contains_paper_titles(
        self,
        client: AsyncClient,
        conference: Conference,
        db_session: AsyncSession,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
        speakers,
    ):
        alice = speakers[0]
        await client.post(
            f"/api/v1/conferences/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )

        # Get Alice's message threads and their messages
        result = await db_session.execute(
            select(MessageParticipant.thread_id).where(
                MessageParticipant.participant_type == "applicant",
                MessageParticipant.participant_id == alice.id,
            )
        )
        thread_ids = [row[0] for row in result.all()]

        msg_result = await db_session.execute(select(Message.body_html).where(Message.thread_id.in_(thread_ids)))
        bodies = [row[0] for row in msg_result.all()]
        all_body_text = " ".join(bodies)

        # Paper1 (accepted) and Paper2 (rejected) should appear in the bodies
        assert papers[0].title in all_body_text
        assert papers[1].title in all_body_text

    @pytest.mark.asyncio
    async def test_publish_no_papers_returns_error(
        self,
        client: AsyncClient,
        conference: Conference,
        admin_token: str,
        modules,
        program_grid,
    ):
        """Publish with no papers should return validation error."""
        resp = await client.post(
            f"/api/v1/conferences/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 422 or resp.status_code == 400


# ── Co-speaker Tests ──────────────────────────────────────────────────


class TestPublishWithCospeakers:
    """Tests that co-speakers receive notifications."""

    @pytest.mark.asyncio
    async def test_cospeaker_receives_notification(
        self,
        client: AsyncClient,
        conference: Conference,
        db_session: AsyncSession,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
        speakers,
    ):
        """Add Carol as co-speaker on Paper1 (Alice's accepted paper).
        Carol should get an acceptance notification for Paper1."""
        carol = speakers[2]
        # Add Carol as co-speaker on Paper1
        db_session.add(
            CFPPaperCospeaker(
                paper_id=papers[0].id,
                applicant_id=carol.id,
                sort_order=0,
            )
        )
        await db_session.commit()

        await client.post(
            f"/api/v1/conferences/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )

        # Carol should have 2 threads: acceptance (co-speaker on Paper1) + rejection (Paper4)
        result = await db_session.execute(
            select(MessageParticipant).where(
                MessageParticipant.participant_type == "applicant",
                MessageParticipant.participant_id == carol.id,
            )
        )
        carol_threads = result.scalars().all()
        assert len(carol_threads) == 2


# ── Update Tests ──────────────────────────────────────────────────────


class TestUpdateProgram:
    """Tests for POST /conferences/{id}/program/update."""

    @pytest.mark.asyncio
    async def test_update_requires_previous_publish(
        self,
        client: AsyncClient,
        conference: Conference,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
    ):
        resp = await client.post(
            f"/api/v1/conferences/{conference.id}/program/update",
            headers=auth_headers(admin_token),
        )
        # Should fail because program hasn't been published yet
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_update_no_changes_sends_zero_notifications(
        self,
        client: AsyncClient,
        conference: Conference,
        db_session: AsyncSession,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
    ):
        """Publish, then immediately update with no changes."""
        # First publish
        await client.post(
            f"/api/v1/conferences/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )

        # Count threads after publish
        result = await db_session.execute(select(MessageThread).where(MessageThread.conference_id == conference.id))
        threads_after_publish = len(result.scalars().all())

        # Update with no changes
        resp = await client.post(
            f"/api/v1/conferences/{conference.id}/program/update",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["notifications_sent"] == 0

        # Thread count should not increase
        result = await db_session.execute(select(MessageThread).where(MessageThread.conference_id == conference.id))
        threads_after_update = len(result.scalars().all())
        assert threads_after_update == threads_after_publish

    @pytest.mark.asyncio
    async def test_update_newly_added_paper_gets_acceptance(
        self,
        client: AsyncClient,
        conference: Conference,
        db_session: AsyncSession,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
        program_grid,
        tenant,
    ):
        """After publish, add Paper2 (Alice's rejected paper) to a session,
        then update -> Alice should get a new acceptance notification."""
        # First publish
        await client.post(
            f"/api/v1/conferences/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )

        # Add Paper2 to a new session
        slots = program_grid["slots"]
        tracks = program_grid["tracks"]
        new_session = ProgramSession(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            start_slot_id=slots[1].id,
            start_track_id=tracks[0].id,
            title=papers[1].title,
            paper_id=papers[1].id,
            slot_span=1,
            track_span=1,
        )
        db_session.add(new_session)
        await db_session.commit()

        # Update
        resp = await client.post(
            f"/api/v1/conferences/{conference.id}/program/update",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["notifications_sent"] > 0
        assert data["papers_accepted"] == 3  # now 3 papers in sessions

    @pytest.mark.asyncio
    async def test_update_removed_paper_gets_rejection(
        self,
        client: AsyncClient,
        conference: Conference,
        db_session: AsyncSession,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
    ):
        """After publish, remove Paper3 (Bob's accepted paper) from session,
        then update -> Bob should get a rejection notification."""
        # First publish
        await client.post(
            f"/api/v1/conferences/{conference.id}/program/publish",
            headers=auth_headers(admin_token),
        )

        # Remove Paper3 from its session
        result = await db_session.execute(select(ProgramSession).where(ProgramSession.paper_id == papers[2].id))
        session = result.scalar_one()
        session.paper_id = None
        session.title = "Empty Session"
        await db_session.commit()

        # Update
        resp = await client.post(
            f"/api/v1/conferences/{conference.id}/program/update",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["notifications_sent"] > 0


# ── Sessions Export Tests ──────────────────────────────────────────────


class TestSessionsExport:
    """Tests for GET /conferences/{id}/program/sessions/export."""

    @pytest.mark.asyncio
    async def test_export_returns_csv(
        self,
        client: AsyncClient,
        conference: Conference,
        admin_token: str,
        modules,
        sessions_with_papers,
    ):
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/program/sessions/export",
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_export_contains_header_row(
        self,
        client: AsyncClient,
        conference: Conference,
        admin_token: str,
        modules,
        sessions_with_papers,
    ):
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/program/sessions/export",
            headers=auth_headers(admin_token),
        )
        content = resp.text
        assert "Session Title" in content
        assert "Speaker Name" in content
        assert "Paper Title" in content

    @pytest.mark.asyncio
    async def test_export_contains_session_data(
        self,
        client: AsyncClient,
        conference: Conference,
        admin_token: str,
        modules,
        sessions_with_papers,
        papers,
    ):
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/program/sessions/export",
            headers=auth_headers(admin_token),
        )
        content = resp.text
        # Should contain paper titles from assigned sessions
        assert papers[0].title in content
        assert papers[2].title in content

    @pytest.mark.asyncio
    async def test_export_has_content_disposition(
        self,
        client: AsyncClient,
        conference: Conference,
        admin_token: str,
        modules,
        sessions_with_papers,
    ):
        resp = await client.get(
            f"/api/v1/conferences/{conference.id}/program/sessions/export",
            headers=auth_headers(admin_token),
        )
        cd = resp.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert ".csv" in cd
