"""Deep coverage tests for messaging threads, portal messaging, sponsor contracts, and volunteer tasks.

Targets uncovered happy-path code in:
- app/api/v1/messaging/threads.py  (admin messaging)
- app/api/v1/cfp_portal/messaging.py  (portal messaging)
- app/api/v1/sponsor_contracts.py  (sponsor contract management)
- app/api/v1/volunteer_tasks.py  (volunteer task assignments)

Focus: exercising the MAIN successful code paths (200/201 responses) that
are missed by existing error-path and auth tests.
"""

import datetime
import io
import os
import uuid
import zipfile

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
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import create_applicant_access_token
from app.core.security import hash_password
from app.models.associations import ConferenceVolunteer
from app.models.attachment import Attachment
from app.models.cfp import CFPApplicant
from app.models.conference import Conference
from app.models.messaging import Message, MessageParticipant, MessageThread
from app.models.module import Module, TenantModule
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.models.settings import SponsorPackage, VolunteerRole
from app.models.sponsor import Sponsor
from app.models.sponsor_contract import SponsorContract, SponsorContractVersion
from app.models.tenant import Tenant
from app.models.user import User
from app.models.volunteer import Volunteer
from app.models.volunteer_tasks import SessionVolunteerTask, VolunteerAssignment
from tests.conftest import _make_token, auth_headers

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _admin_token(user: User, extra_modules: list[str] | None = None) -> str:
    modules = ["cfp", "messaging", "conferences", "sponsors", "volunteers"]
    if extra_modules:
        modules.extend(extra_modules)
    return _make_token(user, modules=modules)


def _admin_headers(user: User) -> dict[str, str]:
    return auth_headers(_admin_token(user))


def _msg_url(conference_id: uuid.UUID, path: str = "") -> str:
    return f"/api/v1/conferences/{conference_id}/messaging{path}"


def _contract_url(conference_id: uuid.UUID, sponsor_id: uuid.UUID, path: str = "") -> str:
    base = f"/api/v1/conferences/{conference_id}/sponsors/{sponsor_id}/contract"
    return f"{base}/{path}" if path else base


def _vol_url(conference_id: uuid.UUID, path: str = "") -> str:
    return f"/api/v1/conferences/{conference_id}/volunteer-tasks{path}"


# ---------------------------------------------------------------------------
# Shared module fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="Call for Papers", code="cfp", description="CFP", is_active=True)
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def messaging_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="Messaging", code="messaging", description="Messaging", is_active=True)
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def sponsors_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="Sponsors", code="sponsors", description="Sponsors", is_active=True)
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def volunteers_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="Volunteers", code="volunteers", description="Volunteers", is_active=True)
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def all_modules_tenant(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    cfp_module: Module,
    messaging_module: Module,
    sponsors_module: Module,
    volunteers_module: Module,
) -> Tenant:
    for mod in (conferences_module, cfp_module, messaging_module, sponsors_module, volunteers_module):
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=mod.id, is_enabled=True))
    await db_session.commit()
    return tenant


# ---------------------------------------------------------------------------
# Applicant fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Alice",
        last_name="Wonderland",
        email=f"alice-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        email_verified_at=datetime.datetime.now(datetime.UTC),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def applicant2(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Bob",
        last_name="Builder",
        email=f"bob-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        email_verified_at=datetime.datetime.now(datetime.UTC),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest.fixture()
def applicant_token(applicant: CFPApplicant, tenant: Tenant) -> str:
    return create_applicant_access_token(applicant.id, tenant.id)


@pytest.fixture()
def applicant2_token(applicant2: CFPApplicant, tenant: Tenant) -> str:
    return create_applicant_access_token(applicant2.id, tenant.id)


# ---------------------------------------------------------------------------
# Messaging thread fixture
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def thread_with_data(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    tenant_admin_user: User,
    applicant: CFPApplicant,
) -> MessageThread:
    """Thread with admin and applicant participant, one admin message, one internal note."""
    thread = MessageThread(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        subject="Coverage Thread",
    )
    db_session.add(thread)
    await db_session.flush()

    db_session.add(
        MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type="user",
            participant_id=tenant_admin_user.id,
        )
    )
    db_session.add(
        MessageParticipant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            participant_type="applicant",
            participant_id=applicant.id,
        )
    )
    db_session.add(
        Message(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=tenant_admin_user.id,
            body_html="<p>Welcome to coverage testing</p>",
        )
    )
    db_session.add(
        Message(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            thread_id=thread.id,
            sender_type="user",
            sender_id=tenant_admin_user.id,
            body_html="<p>Private admin note</p>",
            is_internal_note=True,
        )
    )
    await db_session.commit()
    return thread


# ---------------------------------------------------------------------------
# Sponsor / Contract fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def sponsor_package(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> SponsorPackage:
    pkg = SponsorPackage(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Platinum",
        description="Platinum package",
        price=20000,
        currency="EUR",
        is_active=True,
    )
    db_session.add(pkg)
    await db_session.commit()
    return pkg


@pytest_asyncio.fixture()
async def package_template(db_session: AsyncSession, tenant: Tenant, sponsor_package: SponsorPackage) -> Attachment:
    content = b"This is a contract template for {{company_name}}."
    att = Attachment(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        entity_type="sponsor_package_contract",
        entity_id=sponsor_package.id,
        filename="template.txt",
        content_type="text/plain",
        file_size=len(content),
        file_data=content,
    )
    db_session.add(att)
    await db_session.commit()
    return att


@pytest_asyncio.fixture()
async def sponsor(
    db_session: AsyncSession, tenant: Tenant, conference: Conference, sponsor_package: SponsorPackage
) -> Sponsor:
    s = Sponsor(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        sponsor_package_id=sponsor_package.id,
        company_name="CoverageCo",
        phone="+12345",
        is_active=True,
        contact_persons=[
            {"first_name": "John", "last_name": "Doe", "email": "john@coverage.co"},
        ],
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture()
async def editable_contract(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    sponsor: Sponsor,
    tenant_admin_user: User,
) -> SponsorContract:
    c = SponsorContract(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        sponsor_id=sponsor.id,
        conference_id=conference.id,
        source_package_id=sponsor.sponsor_package_id,
        filename="2026-01-01_TC26_Sponsorship_Platinum_CoverageCo",
        content_type="text/plain",
        file_data=b"<pre>Coverage contract body</pre>",
        file_size=30,
        html_content="<pre>Coverage contract body</pre>",
        is_editable=True,
        version=1,
        status="draft",
        created_by=tenant_admin_user.id,
    )
    db_session.add(c)
    await db_session.commit()
    await db_session.refresh(c)
    return c


# ---------------------------------------------------------------------------
# Volunteer fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def program_day(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> ProgramDay:
    d = ProgramDay(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Day 1",
        date=datetime.date(2026, 7, 1),
        sort_order=0,
    )
    db_session.add(d)
    await db_session.commit()
    return d


@pytest_asyncio.fixture()
async def time_slot(db_session: AsyncSession, tenant: Tenant, program_day: ProgramDay) -> ProgramTimeSlot:
    s = ProgramTimeSlot(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_day_id=program_day.id,
        start_time=datetime.time(9, 0),
        end_time=datetime.time(10, 0),
        sort_order=0,
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture()
async def time_slot2(db_session: AsyncSession, tenant: Tenant, program_day: ProgramDay) -> ProgramTimeSlot:
    s = ProgramTimeSlot(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_day_id=program_day.id,
        start_time=datetime.time(10, 0),
        end_time=datetime.time(11, 0),
        sort_order=1,
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture()
async def track(
    db_session: AsyncSession, tenant: Tenant, conference: Conference, program_day: ProgramDay
) -> ProgramTrack:
    t = ProgramTrack(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        program_day_id=program_day.id,
        name="Main",
        sort_order=0,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def session_obj(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    time_slot: ProgramTimeSlot,
    track: ProgramTrack,
) -> ProgramSession:
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        start_slot_id=time_slot.id,
        start_track_id=track.id,
        slot_span=1,
        track_span=1,
        title="Keynote",
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture()
async def session_multi_slot(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    time_slot: ProgramTimeSlot,
    time_slot2: ProgramTimeSlot,
    track: ProgramTrack,
) -> ProgramSession:
    """Session spanning 2 slots."""
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        start_slot_id=time_slot.id,
        start_track_id=track.id,
        slot_span=2,
        track_span=1,
        title="Full Morning Workshop",
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture()
async def vol_role(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> VolunteerRole:
    r = VolunteerRole(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Room Monitor",
        is_active=True,
    )
    db_session.add(r)
    await db_session.commit()
    return r


@pytest_asyncio.fixture()
async def vol_role2(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> VolunteerRole:
    r = VolunteerRole(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tech Support",
        is_active=True,
    )
    db_session.add(r)
    await db_session.commit()
    return r


@pytest_asyncio.fixture()
async def volunteer(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> Volunteer:
    v = Volunteer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"vol-{uuid.uuid4().hex[:6]}@test.com",
        first_name="Vera",
        last_name="Volunteer",
        status="approved",
    )
    db_session.add(v)
    await db_session.flush()
    db_session.add(ConferenceVolunteer(conference_id=conference.id, volunteer_id=v.id))
    await db_session.commit()
    return v


@pytest_asyncio.fixture()
async def volunteer2(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> Volunteer:
    v = Volunteer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"vol2-{uuid.uuid4().hex[:6]}@test.com",
        first_name="Victor",
        last_name="Volunteer",
        status="approved",
    )
    db_session.add(v)
    await db_session.flush()
    db_session.add(ConferenceVolunteer(conference_id=conference.id, volunteer_id=v.id))
    await db_session.commit()
    return v


@pytest_asyncio.fixture()
async def session_task(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    session_obj: ProgramSession,
    vol_role: VolunteerRole,
) -> SessionVolunteerTask:
    svt = SessionVolunteerTask(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        session_id=session_obj.id,
        volunteer_task_id=vol_role.id,
        required_count=2,
    )
    db_session.add(svt)
    await db_session.commit()
    return svt


@pytest_asyncio.fixture()
async def volunteer_assignment(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    session_task: SessionVolunteerTask,
    volunteer: Volunteer,
) -> VolunteerAssignment:
    a = VolunteerAssignment(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        session_volunteer_task_id=session_task.id,
        volunteer_id=volunteer.id,
    )
    db_session.add(a)
    await db_session.commit()
    return a


# ============================================================================
# 1. ADMIN MESSAGING THREADS  (threads.py)
# ============================================================================


class TestAdminThreadListHappyPath:
    """Exercise the full list_threads path with threads containing messages."""

    @pytest.mark.asyncio
    async def test_list_threads_returns_thread_with_details(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        all_modules_tenant: Tenant,
        conference: Conference,
        thread_with_data: MessageThread,
    ) -> None:
        """List threads returns items with last_message, participants, unread, counts."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(_msg_url(conference.id, "/threads"), headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        item = data["items"][0]
        # The list item has all the expected fields populated
        assert "subject" in item
        assert "last_message_preview" in item
        assert "last_message_sender" in item
        assert "other_participants" in item
        assert "message_count" in item
        assert "unread" in item
        assert item["message_count"] >= 1

    @pytest.mark.asyncio
    async def test_list_threads_archived_filter(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        all_modules_tenant: Tenant,
        conference: Conference,
        thread_with_data: MessageThread,
    ) -> None:
        """Archived threads appear when archived=true filter is used."""
        headers = _admin_headers(tenant_admin_user)
        # Archive the thread
        archive_resp = await client.post(
            _msg_url(conference.id, f"/threads/{thread_with_data.id}/archive"),
            headers=headers,
        )
        assert archive_resp.status_code == 200

        # List with archived=true
        resp = await client.get(
            _msg_url(conference.id, "/threads"),
            params={"archived": "true"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert any(item["archived_at"] is not None for item in data["items"])

    @pytest.mark.asyncio
    async def test_list_threads_bulk_id_filter(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        all_modules_tenant: Tenant,
        conference: Conference,
        db_session: AsyncSession,
        tenant: Tenant,
        applicant: CFPApplicant,
    ) -> None:
        """Filter by bulk_id returns only threads with that bulk_id."""
        bulk_id = uuid.uuid4()
        thread = MessageThread(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            subject="Bulk Thread",
            bulk_id=bulk_id,
        )
        db_session.add(thread)
        await db_session.flush()
        db_session.add(
            MessageParticipant(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                thread_id=thread.id,
                participant_type="user",
                participant_id=tenant_admin_user.id,
            )
        )
        db_session.add(
            Message(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                thread_id=thread.id,
                sender_type="user",
                sender_id=tenant_admin_user.id,
                body_html="<p>Bulk message</p>",
            )
        )
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _msg_url(conference.id, "/threads"),
            params={"bulk_id": str(bulk_id)},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert all(item["bulk_id"] == str(bulk_id) for item in data["items"])


class TestAdminThreadDetail:
    """Get thread detail with participants and messages resolved."""

    @pytest.mark.asyncio
    async def test_get_thread_detail(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        all_modules_tenant: Tenant,
        conference: Conference,
        thread_with_data: MessageThread,
    ) -> None:
        """Thread detail returns resolved participants, sorted messages, attachments."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _msg_url(conference.id, f"/threads/{thread_with_data.id}"),
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == str(thread_with_data.id)
        assert len(data["participants"]) == 2
        assert len(data["messages"]) == 2  # includes internal note for admin
        # Messages sorted by created_at
        for msg in data["messages"]:
            assert "sender" in msg
            assert "body_html" in msg


class TestAdminCreateThread:
    """Create thread happy path with single and multiple recipients."""

    @pytest.mark.asyncio
    async def test_create_thread_single_recipient(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        all_modules_tenant: Tenant,
        conference: Conference,
        applicant: CFPApplicant,
    ) -> None:
        """Create a single thread to one applicant."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            _msg_url(conference.id, "/threads"),
            json={
                "recipient_applicant_ids": [str(applicant.id)],
                "subject": "Welcome message",
                "body_html": "<p>Hello and welcome!</p>",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["threads_created"] == 1
        assert data["first_thread"]["subject"] == "Welcome message"
        assert len(data["first_thread"]["messages"]) == 1
        assert len(data["first_thread"]["participants"]) == 2

    @pytest.mark.asyncio
    async def test_create_thread_to_multiple_recipients(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        all_modules_tenant: Tenant,
        conference: Conference,
        applicant: CFPApplicant,
        applicant2: CFPApplicant,
    ) -> None:
        """Create threads to multiple applicants at once."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            _msg_url(conference.id, "/threads"),
            json={
                "recipient_applicant_ids": [str(applicant.id), str(applicant2.id)],
                "subject": "Conference update",
                "body_html": "<p>Important update for all speakers.</p>",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["threads_created"] == 2


class TestAdminReplyToThread:
    """Reply to existing thread."""

    @pytest.mark.asyncio
    async def test_reply_creates_message(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        all_modules_tenant: Tenant,
        conference: Conference,
        thread_with_data: MessageThread,
    ) -> None:
        """Reply to a thread returns the new message with sender info."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            _msg_url(conference.id, f"/threads/{thread_with_data.id}/reply"),
            json={"body_html": "<p>Admin reply content.</p>"},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["body_html"] == "<p>Admin reply content.</p>"
        assert data["sender"]["type"] == "user"
        assert data["thread_id"] == str(thread_with_data.id)


class TestAdminInternalNote:
    """Create internal note on a thread."""

    @pytest.mark.asyncio
    async def test_create_internal_note(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        all_modules_tenant: Tenant,
        conference: Conference,
        thread_with_data: MessageThread,
    ) -> None:
        """Internal note is created successfully and marked as internal."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            _msg_url(conference.id, f"/threads/{thread_with_data.id}/note"),
            json={"body_html": "<p>Internal observation.</p>"},
            headers=headers,
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["is_internal_note"] is True
        assert data["body_html"] == "<p>Internal observation.</p>"


class TestAdminArchiveUnarchive:
    """Archive and unarchive thread flow."""

    @pytest.mark.asyncio
    async def test_archive_and_unarchive(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        all_modules_tenant: Tenant,
        conference: Conference,
        thread_with_data: MessageThread,
    ) -> None:
        """Archive then unarchive restores the thread."""
        headers = _admin_headers(tenant_admin_user)

        # Archive
        resp = await client.post(
            _msg_url(conference.id, f"/threads/{thread_with_data.id}/archive"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # Unarchive
        resp = await client.post(
            _msg_url(conference.id, f"/threads/{thread_with_data.id}/unarchive"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True


class TestAdminFlagToggle:
    """Flag and unflag a thread."""

    @pytest.mark.asyncio
    async def test_flag_then_unflag(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        all_modules_tenant: Tenant,
        conference: Conference,
        thread_with_data: MessageThread,
    ) -> None:
        """Toggle flag: first call flags, second call unflags."""
        headers = _admin_headers(tenant_admin_user)

        # Flag
        resp = await client.post(
            _msg_url(conference.id, f"/threads/{thread_with_data.id}/flag"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["flagged"] is True

        # Unflag
        resp = await client.post(
            _msg_url(conference.id, f"/threads/{thread_with_data.id}/flag"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["flagged"] is False


class TestAdminMarkRead:
    """Mark thread as read."""

    @pytest.mark.asyncio
    async def test_mark_read(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        all_modules_tenant: Tenant,
        conference: Conference,
        thread_with_data: MessageThread,
    ) -> None:
        """Mark read updates the participant last_read_at."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            _msg_url(conference.id, f"/threads/{thread_with_data.id}/read"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True


class TestAdminExportThread:
    """Export thread in both formats."""

    @pytest.mark.asyncio
    async def test_export_html(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        all_modules_tenant: Tenant,
        conference: Conference,
        thread_with_data: MessageThread,
    ) -> None:
        """Export as HTML returns styled HTML document."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _msg_url(conference.id, f"/threads/{thread_with_data.id}/export"),
            params={"format": "html"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]
        assert "<html>" in resp.text
        assert "Coverage Thread" in resp.text

    @pytest.mark.asyncio
    async def test_export_text(
        self,
        client: AsyncClient,
        tenant_admin_user: User,
        all_modules_tenant: Tenant,
        conference: Conference,
        thread_with_data: MessageThread,
    ) -> None:
        """Export as text returns plain text with subject and messages."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _msg_url(conference.id, f"/threads/{thread_with_data.id}/export"),
            params={"format": "text"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert "text/plain" in resp.headers["content-type"]
        assert "Subject: Coverage Thread" in resp.text


# ============================================================================
# 2. PORTAL MESSAGING (cfp_portal/messaging.py)
# ============================================================================


class TestPortalListThreads:
    """Portal list threads happy path."""

    @pytest.mark.asyncio
    async def test_portal_list_with_conference_filter(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        conference: Conference,
        thread_with_data: MessageThread,
    ) -> None:
        """Portal list with conference_id filter returns matching threads."""
        resp = await client.get(
            "/api/v1/portal/messages",
            params={"conference_id": str(conference.id)},
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        for item in data["items"]:
            assert "subject" in item
            assert "message_count" in item

    @pytest.mark.asyncio
    async def test_portal_list_empty_for_other_applicant(
        self,
        client: AsyncClient,
        applicant2: CFPApplicant,
        applicant2_token: str,
        thread_with_data: MessageThread,
    ) -> None:
        """Other applicant sees no threads when not a participant."""
        resp = await client.get(
            "/api/v1/portal/messages",
            headers=auth_headers(applicant2_token),
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


class TestPortalThreadDetail:
    """Portal thread detail."""

    @pytest.mark.asyncio
    async def test_portal_detail_excludes_internal_notes(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        thread_with_data: MessageThread,
    ) -> None:
        """Portal detail filters out internal notes from messages."""
        resp = await client.get(
            f"/api/v1/portal/messages/{thread_with_data.id}",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        # Only 1 visible message (the non-internal one)
        assert len(data["messages"]) == 1
        assert data["messages"][0]["body_html"] == "<p>Welcome to coverage testing</p>"


class TestPortalCreateThread:
    """Portal create thread (applicant to admins)."""

    @pytest.mark.asyncio
    async def test_portal_create_thread(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        conference: Conference,
        tenant_admin_user: User,
        all_modules_tenant: Tenant,
    ) -> None:
        """Applicant creates a new thread; admins are added as participants."""
        resp = await client.post(
            "/api/v1/portal/messages",
            json={
                "conference_id": str(conference.id),
                "subject": "Question about my paper",
                "body_html": "<p>I have a question.</p>",
            },
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["subject"] == "Question about my paper"
        assert len(data["messages"]) == 1
        # At least 2 participants (applicant + admin)
        assert len(data["participants"]) >= 2


class TestPortalReply:
    """Portal reply to thread."""

    @pytest.mark.asyncio
    async def test_portal_reply(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        thread_with_data: MessageThread,
    ) -> None:
        """Applicant replies to a thread and gets back sender info."""
        resp = await client.post(
            f"/api/v1/portal/messages/{thread_with_data.id}/reply",
            json={"body_html": "<p>Thank you for the info.</p>"},
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["sender"]["type"] == "applicant"
        assert data["sender"]["first_name"] == "Alice"


class TestPortalMarkRead:
    """Portal mark thread read."""

    @pytest.mark.asyncio
    async def test_portal_mark_read(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        thread_with_data: MessageThread,
    ) -> None:
        """Portal mark read returns ok."""
        resp = await client.post(
            f"/api/v1/portal/messages/{thread_with_data.id}/read",
            headers=auth_headers(applicant_token),
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True


class TestPortalArchiveUnarchive:
    """Portal archive and unarchive threads."""

    @pytest.mark.asyncio
    async def test_portal_archive_then_unarchive(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        thread_with_data: MessageThread,
    ) -> None:
        """Archive then unarchive flow from portal."""
        headers = auth_headers(applicant_token)

        # Archive
        resp = await client.post(
            f"/api/v1/portal/messages/{thread_with_data.id}/archive",
            headers=headers,
        )
        assert resp.status_code == 200

        # List archived
        resp = await client.get(
            "/api/v1/portal/messages",
            params={"archived": "true"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["total"] >= 1

        # Unarchive
        resp = await client.post(
            f"/api/v1/portal/messages/{thread_with_data.id}/unarchive",
            headers=headers,
        )
        assert resp.status_code == 200


class TestPortalUnreadCount:
    """Portal unread count."""

    @pytest.mark.asyncio
    async def test_unread_count_nonzero_then_zero(
        self,
        client: AsyncClient,
        applicant: CFPApplicant,
        applicant_token: str,
        thread_with_data: MessageThread,
    ) -> None:
        """Unread count starts > 0, then drops to 0 after marking read."""
        headers = auth_headers(applicant_token)

        resp = await client.get("/api/v1/portal/messages/unread-count", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["unread_count"] >= 1

        # Mark read
        await client.post(f"/api/v1/portal/messages/{thread_with_data.id}/read", headers=headers)

        resp = await client.get("/api/v1/portal/messages/unread-count", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["unread_count"] == 0


# ============================================================================
# 3. SPONSOR CONTRACTS  (sponsor_contracts.py)
# ============================================================================


class TestContractGenerate:
    """Generate contract from package template."""

    @pytest.mark.asyncio
    async def test_generate_contract_success(
        self,
        client: AsyncClient,
        conference: Conference,
        sponsor: Sponsor,
        package_template: Attachment,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Generate a new contract from the package template."""
        headers = _admin_headers(tenant_admin_user)
        url = _contract_url(conference.id, sponsor.id, "generate")
        resp = await client.post(url, headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "draft"
        assert data["version"] == 1
        assert data["is_editable"] is True
        assert "CoverageCo" in data["filename"]

    @pytest.mark.asyncio
    async def test_generate_force_overwrites_existing(
        self,
        client: AsyncClient,
        conference: Conference,
        sponsor: Sponsor,
        editable_contract: SponsorContract,
        package_template: Attachment,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Force regenerate saves old version and bumps version number."""
        headers = _admin_headers(tenant_admin_user)
        url = _contract_url(conference.id, sponsor.id, "generate")
        resp = await client.post(url, params={"force": "true"}, headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["version"] == 2
        assert data["version_count"] == 1  # snapshot of v1


class TestContractSaveContent:
    """Save edited HTML content."""

    @pytest.mark.asyncio
    async def test_save_content_bumps_version(
        self,
        client: AsyncClient,
        conference: Conference,
        sponsor: Sponsor,
        editable_contract: SponsorContract,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Saving content creates version snapshot and bumps version."""
        headers = _admin_headers(tenant_admin_user)
        url = _contract_url(conference.id, sponsor.id, "content")
        resp = await client.put(
            url,
            json={"html_content": "<h1>Updated Terms</h1>"},
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["version"] == 2
        assert data["html_content"] == "<h1>Updated Terms</h1>"


class TestContractStatusTransitions:
    """Status transitions between draft/sent/signed."""

    @pytest.mark.asyncio
    async def test_status_draft_to_sent(
        self,
        client: AsyncClient,
        conference: Conference,
        sponsor: Sponsor,
        editable_contract: SponsorContract,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Change status from draft to sent."""
        headers = _admin_headers(tenant_admin_user)
        url = _contract_url(conference.id, sponsor.id, "status")
        resp = await client.put(url, json={"status": "sent"}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "sent"

    @pytest.mark.asyncio
    async def test_status_sent_to_signed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        sponsor: Sponsor,
        editable_contract: SponsorContract,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Change status from sent to signed."""
        editable_contract.status = "sent"
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        url = _contract_url(conference.id, sponsor.id, "status")
        resp = await client.put(url, json={"status": "signed"}, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "signed"


class TestContractDownloads:
    """Download contract as DOCX and PDF."""

    @pytest.mark.asyncio
    async def test_download_editable_as_docx(
        self,
        client: AsyncClient,
        conference: Conference,
        sponsor: Sponsor,
        editable_contract: SponsorContract,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Download editable contract generates DOCX."""
        headers = _admin_headers(tenant_admin_user)
        url = _contract_url(conference.id, sponsor.id, "download")
        resp = await client.get(url, headers=headers)
        assert resp.status_code == 200
        assert "application/vnd.openxmlformats" in resp.headers["content-type"]

    @pytest.mark.asyncio
    async def test_download_pdf_from_html(
        self,
        client: AsyncClient,
        conference: Conference,
        sponsor: Sponsor,
        editable_contract: SponsorContract,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Generate PDF from HTML content."""
        headers = _admin_headers(tenant_admin_user)
        url = _contract_url(conference.id, sponsor.id, "pdf")
        resp = await client.get(url, headers=headers)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content[:4] == b"%PDF"


class TestContractVersionHistory:
    """Version listing and download."""

    @pytest.mark.asyncio
    async def test_list_versions_after_edit(
        self,
        client: AsyncClient,
        conference: Conference,
        sponsor: Sponsor,
        editable_contract: SponsorContract,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """After editing content, versions list shows the snapshot."""
        headers = _admin_headers(tenant_admin_user)
        # Edit content to create a version snapshot
        await client.put(
            _contract_url(conference.id, sponsor.id, "content"),
            json={"html_content": "<p>Version 2 content</p>"},
            headers=headers,
        )

        resp = await client.get(
            _contract_url(conference.id, sponsor.id, "versions"),
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["version"] == 1

    @pytest.mark.asyncio
    async def test_get_specific_version(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        sponsor: Sponsor,
        editable_contract: SponsorContract,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Get a specific version by number."""
        # Create a version snapshot
        v1 = SponsorContractVersion(
            id=uuid.uuid4(),
            contract_id=editable_contract.id,
            version=1,
            html_content="<p>Version 1</p>",
            file_data=None,
            content_type="text/plain",
            file_size=17,
            filename=editable_contract.filename,
            created_by=tenant_admin_user.id,
        )
        db_session.add(v1)
        editable_contract.version = 2
        await db_session.commit()

        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _contract_url(conference.id, sponsor.id, "versions/1"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["version"] == 1
        assert resp.json()["html_content"] == "<p>Version 1</p>"


class TestContractSendPreviewAndSend:
    """Send preview and actual send."""

    @pytest.mark.asyncio
    async def test_send_preview(
        self,
        client: AsyncClient,
        conference: Conference,
        sponsor: Sponsor,
        editable_contract: SponsorContract,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Send preview returns rendered subject and body."""
        headers = _admin_headers(tenant_admin_user)
        url = _contract_url(conference.id, sponsor.id, "send-preview")
        resp = await client.get(url, headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "subject" in data
        assert "body_html" in data

    @pytest.mark.asyncio
    async def test_send_contract_to_recipient(
        self,
        client: AsyncClient,
        conference: Conference,
        sponsor: Sponsor,
        editable_contract: SponsorContract,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Send contract via email updates status to sent."""
        headers = _admin_headers(tenant_admin_user)
        url = _contract_url(conference.id, sponsor.id, "send")
        resp = await client.post(
            url,
            json={
                "recipient_emails": ["recipient@test.com"],
                "subject": "Your contract",
                "body_html": "<p>Please review.</p>",
                "include_contact_persons": [],
                "send_as_pdf": False,
            },
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["sent_count"] == 1

        # Verify status changed to sent
        get_resp = await client.get(
            _contract_url(conference.id, sponsor.id),
            headers=headers,
        )
        assert get_resp.json()["status"] == "sent"

    @pytest.mark.asyncio
    async def test_send_with_contact_persons(
        self,
        client: AsyncClient,
        conference: Conference,
        sponsor: Sponsor,
        editable_contract: SponsorContract,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Send including contact persons adds their emails."""
        headers = _admin_headers(tenant_admin_user)
        url = _contract_url(conference.id, sponsor.id, "send")
        resp = await client.post(
            url,
            json={
                "recipient_emails": [],
                "subject": "Contract",
                "body_html": "<p>Attached.</p>",
                "include_contact_persons": [0],
                "send_as_pdf": False,
            },
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["sent_count"] == 1


class TestContractDelete:
    """Delete contract."""

    @pytest.mark.asyncio
    async def test_delete_contract(
        self,
        client: AsyncClient,
        conference: Conference,
        sponsor: Sponsor,
        editable_contract: SponsorContract,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Delete contract returns success message."""
        headers = _admin_headers(tenant_admin_user)
        url = _contract_url(conference.id, sponsor.id)
        resp = await client.delete(url, headers=headers)
        assert resp.status_code == 200
        assert "deleted" in resp.json()["message"].lower()


# ============================================================================
# 4. VOLUNTEER TASKS  (volunteer_tasks.py)
# ============================================================================


class TestSessionTasksCRUD:
    """Session-task create, list, update, delete happy paths."""

    @pytest.mark.asyncio
    async def test_create_session_task(
        self,
        client: AsyncClient,
        conference: Conference,
        session_obj: ProgramSession,
        vol_role: VolunteerRole,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Create a session-task assignment."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            _vol_url(conference.id, "/session-tasks"),
            json={
                "session_id": str(session_obj.id),
                "volunteer_task_id": str(vol_role.id),
                "required_count": 3,
            },
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["volunteer_task_name"] == "Room Monitor"
        assert data["required_count"] == 3
        assert data["assigned_count"] == 0

    @pytest.mark.asyncio
    async def test_list_session_tasks(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """List session tasks grouped by session."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _vol_url(conference.id, "/session-tasks"),
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert len(data["items"]) >= 1
        assert data["items"][0]["tasks"][0]["volunteer_task_name"] == "Room Monitor"

    @pytest.mark.asyncio
    async def test_update_session_task(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Update required_count on a session-task."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.put(
            _vol_url(conference.id, f"/session-tasks/{session_task.id}"),
            json={"required_count": 5},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["required_count"] == 5

    @pytest.mark.asyncio
    async def test_delete_session_task(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Delete a session-task."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.delete(
            _vol_url(conference.id, f"/session-tasks/{session_task.id}"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert "removed" in resp.json()["message"].lower()


class TestVolunteerAssignmentCRUD:
    """Volunteer assignment create, list, delete happy paths."""

    @pytest.mark.asyncio
    async def test_create_assignment(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        volunteer: Volunteer,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Assign a volunteer to a session-task."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.post(
            _vol_url(conference.id, "/volunteer-assignments"),
            json={
                "session_volunteer_task_id": str(session_task.id),
                "volunteer_id": str(volunteer.id),
            },
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["volunteer_name"] == "Vera Volunteer"
        assert data["volunteer_id"] == str(volunteer.id)

    @pytest.mark.asyncio
    async def test_list_assignments_overview(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        volunteer_assignment: VolunteerAssignment,
        volunteer: Volunteer,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Assignment overview groups by task with session details."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _vol_url(conference.id, "/volunteer-assignments"),
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) >= 1
        task_overview = data["items"][0]
        assert task_overview["volunteer_task_name"] == "Room Monitor"
        assert len(task_overview["sessions"]) >= 1
        session_detail = task_overview["sessions"][0]
        assert session_detail["session_title"] == "Keynote"
        assert len(session_detail["assigned_volunteers"]) == 1

    @pytest.mark.asyncio
    async def test_delete_assignment(
        self,
        client: AsyncClient,
        conference: Conference,
        volunteer_assignment: VolunteerAssignment,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Delete a volunteer assignment."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.delete(
            _vol_url(conference.id, f"/volunteer-assignments/{volunteer_assignment.id}"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert "unassigned" in resp.json()["message"].lower()


class TestVolunteerColor:
    """Set volunteer color."""

    @pytest.mark.asyncio
    async def test_set_color(
        self,
        client: AsyncClient,
        conference: Conference,
        volunteer: Volunteer,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Set color returns the new color."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.patch(
            _vol_url(conference.id, f"/volunteers/{volunteer.id}/color"),
            json={"color": "#3B82F6"},
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.json()["color"] == "#3B82F6"


class TestVolunteerSchedule:
    """Volunteer schedule views."""

    @pytest.mark.asyncio
    async def test_list_all_schedules(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        volunteer_assignment: VolunteerAssignment,
        volunteer: Volunteer,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """List all volunteer schedules returns populated entries."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _vol_url(conference.id, "/volunteer-schedule"),
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) >= 1
        assert data["items"][0]["volunteer_name"] == "Vera Volunteer"
        assert len(data["items"][0]["entries"]) >= 1

    @pytest.mark.asyncio
    async def test_get_single_schedule(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        volunteer_assignment: VolunteerAssignment,
        volunteer: Volunteer,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Get single volunteer schedule with entries."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _vol_url(conference.id, f"/volunteer-schedule/{volunteer.id}"),
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["volunteer_name"] == "Vera Volunteer"
        assert len(data["entries"]) >= 1
        entry = data["entries"][0]
        assert entry["day_name"] == "Day 1"
        assert entry["start_time"] == "09:00"
        assert entry["end_time"] == "10:00"
        assert entry["task_name"] == "Room Monitor"

    @pytest.mark.asyncio
    async def test_unassigned_sessions(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        volunteer_assignment: VolunteerAssignment,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """Unassigned sessions lists under-staffed session-tasks."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _vol_url(conference.id, "/volunteer-schedule/unassigned"),
            headers=headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        # session_task requires 2 but only 1 assigned
        assert data["total"] >= 1
        item = data["items"][0]
        assert item["required_count"] == 2
        assert item["assigned_count"] == 1


class TestVolunteerSchedulePDF:
    """PDF export for volunteer schedules."""

    @pytest.mark.asyncio
    async def test_single_volunteer_pdf(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        volunteer_assignment: VolunteerAssignment,
        volunteer: Volunteer,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """PDF export for a single volunteer returns valid PDF."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _vol_url(conference.id, f"/volunteer-schedule/{volunteer.id}/pdf"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert resp.content[:4] == b"%PDF"

    @pytest.mark.asyncio
    async def test_all_schedules_zip(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        volunteer_assignment: VolunteerAssignment,
        volunteer: Volunteer,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """ZIP of all schedules contains PDFs."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _vol_url(conference.id, "/volunteer-schedules-pdf"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"
        zf = zipfile.ZipFile(io.BytesIO(resp.content))
        names = zf.namelist()
        assert len(names) >= 1
        for name in names:
            assert name.endswith(".pdf")
            assert zf.read(name)[:4] == b"%PDF"

    @pytest.mark.asyncio
    async def test_pdf_with_color(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        volunteer_assignment: VolunteerAssignment,
        volunteer: Volunteer,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """PDF generates correctly when volunteer has a color set."""
        headers = _admin_headers(tenant_admin_user)
        # Set color
        await client.patch(
            _vol_url(conference.id, f"/volunteers/{volunteer.id}/color"),
            json={"color": "#EF4444"},
            headers=headers,
        )
        resp = await client.get(
            _vol_url(conference.id, f"/volunteer-schedule/{volunteer.id}/pdf"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.content[:4] == b"%PDF"

    @pytest.mark.asyncio
    async def test_empty_schedule_pdf(
        self,
        client: AsyncClient,
        conference: Conference,
        volunteer: Volunteer,
        all_modules_tenant: Tenant,
        tenant_admin_user: User,
    ) -> None:
        """PDF for volunteer with no assignments generates empty schedule PDF."""
        headers = _admin_headers(tenant_admin_user)
        resp = await client.get(
            _vol_url(conference.id, f"/volunteer-schedule/{volunteer.id}/pdf"),
            headers=headers,
        )
        assert resp.status_code == 200
        assert resp.content[:4] == b"%PDF"
