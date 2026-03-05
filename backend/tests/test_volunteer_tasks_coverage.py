"""Comprehensive coverage tests for volunteer task assignment endpoints.

Complements test_volunteer_tasks.py with auth edge cases, multi-entity
scenarios, cross-conference isolation, schedule detail validation,
multi-slot span sessions, and boundary conditions.
"""

import datetime
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.associations import ConferenceVolunteer
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.models.settings import VolunteerRole
from app.models.tenant import Tenant
from app.models.user import User
from app.models.volunteer import Volunteer
from app.models.volunteer_tasks import SessionVolunteerTask, VolunteerAssignment
from tests.conftest import auth_headers

# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User, modules: list[str] | None = None) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


def _url(conference_id: uuid.UUID, path: str = "") -> str:
    return f"/api/v1/conferences/{conference_id}/volunteer-tasks{path}"


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def volunteers_module(db_session: AsyncSession) -> Module:
    m = Module(
        id=uuid.uuid4(),
        name="Volunteers",
        code="volunteers",
        description="Volunteer management",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_vol_module(
    db_session: AsyncSession, tenant: Tenant, conferences_module: Module, volunteers_module: Module
) -> Tenant:
    for mod in (conferences_module, volunteers_module):
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=mod.id, is_enabled=True))
    await db_session.commit()
    return tenant


@pytest_asyncio.fixture()
async def admin_token(tenant_admin_user: User) -> str:
    return _make_token(tenant_admin_user, modules=["conferences", "volunteers"])


@pytest_asyncio.fixture()
async def user_token(regular_user: User) -> str:
    return _make_token(regular_user, modules=["conferences", "volunteers"])


@pytest_asyncio.fixture()
async def program_day(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> ProgramDay:
    d = ProgramDay(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Day 1",
        date=datetime.date(2026, 6, 1),
        sort_order=0,
    )
    db_session.add(d)
    await db_session.commit()
    return d


@pytest_asyncio.fixture()
async def program_day_2(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> ProgramDay:
    d = ProgramDay(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Day 2",
        date=datetime.date(2026, 6, 2),
        sort_order=1,
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
async def time_slot_2(db_session: AsyncSession, tenant: Tenant, program_day: ProgramDay) -> ProgramTimeSlot:
    """A second time slot in the same day, following the first."""
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
async def time_slot_day2(db_session: AsyncSession, tenant: Tenant, program_day_2: ProgramDay) -> ProgramTimeSlot:
    """A time slot on day 2."""
    s = ProgramTimeSlot(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        program_day_id=program_day_2.id,
        start_time=datetime.time(14, 0),
        end_time=datetime.time(15, 0),
        sort_order=0,
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
        name="Track A",
        sort_order=0,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def track_b(
    db_session: AsyncSession, tenant: Tenant, conference: Conference, program_day: ProgramDay
) -> ProgramTrack:
    t = ProgramTrack(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        program_day_id=program_day.id,
        name="Track B",
        sort_order=1,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def session(
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
        title="Opening Keynote",
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture()
async def session_2(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    time_slot_2: ProgramTimeSlot,
    track: ProgramTrack,
) -> ProgramSession:
    """A second session in a different time slot."""
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        start_slot_id=time_slot_2.id,
        start_track_id=track.id,
        slot_span=1,
        track_span=1,
        title="Workshop A",
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture()
async def multi_slot_session(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    time_slot: ProgramTimeSlot,
    time_slot_2: ProgramTimeSlot,
    track: ProgramTrack,
) -> ProgramSession:
    """A session spanning two time slots (09:00-11:00)."""
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        start_slot_id=time_slot.id,
        start_track_id=track.id,
        slot_span=2,
        track_span=1,
        title="Full Morning Tutorial",
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture()
async def session_day2(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    time_slot_day2: ProgramTimeSlot,
    track_b: ProgramTrack,
) -> ProgramSession:
    """A session on day 2."""
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        start_slot_id=time_slot_day2.id,
        start_track_id=track_b.id,
        slot_span=1,
        track_span=1,
        title="Day 2 Panel",
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
        name="Registration Desk",
        is_active=True,
    )
    db_session.add(r)
    await db_session.commit()
    return r


@pytest_asyncio.fixture()
async def vol_role_2(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> VolunteerRole:
    r = VolunteerRole(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="AV Support",
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
        email="vol1@test.com",
        first_name="Alice",
        last_name="Smith",
        status="approved",
    )
    db_session.add(v)
    await db_session.flush()
    db_session.add(ConferenceVolunteer(conference_id=conference.id, volunteer_id=v.id))
    await db_session.commit()
    return v


@pytest_asyncio.fixture()
async def volunteer_2(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> Volunteer:
    v = Volunteer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="vol2@test.com",
        first_name="Bob",
        last_name="Jones",
        status="approved",
    )
    db_session.add(v)
    await db_session.flush()
    db_session.add(ConferenceVolunteer(conference_id=conference.id, volunteer_id=v.id))
    await db_session.commit()
    return v


@pytest_asyncio.fixture()
async def volunteer_3(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> Volunteer:
    v = Volunteer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="vol3@test.com",
        first_name="Charlie",
        last_name="Brown",
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
    session: ProgramSession,
    vol_role: VolunteerRole,
) -> SessionVolunteerTask:
    svt = SessionVolunteerTask(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        session_id=session.id,
        volunteer_task_id=vol_role.id,
        required_count=2,
    )
    db_session.add(svt)
    await db_session.commit()
    return svt


@pytest_asyncio.fixture()
async def assignment(
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


# =====================================================================
# 1. Authentication & Authorization Edge Cases
# =====================================================================


class TestAuthEdgeCases:
    """Tests for authentication and authorization boundaries."""

    @pytest.mark.asyncio
    async def test_no_token_returns_401(
        self, client: AsyncClient, conference: Conference, tenant_with_vol_module: Tenant
    ):
        """Requests without an auth token should get 401."""
        resp = await client.get(_url(conference.id, "/session-tasks"))
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_regular_user_can_read_session_tasks(
        self, client: AsyncClient, conference: Conference, user_token: str, tenant_with_vol_module: Tenant
    ):
        """Regular users (non-admin) should be able to read session-tasks."""
        resp = await client.get(_url(conference.id, "/session-tasks"), headers=auth_headers(user_token))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_regular_user_cannot_update_session_task(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        user_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Regular users should be forbidden from updating session-tasks."""
        resp = await client.put(
            _url(conference.id, f"/session-tasks/{session_task.id}"),
            json={"required_count": 10},
            headers=auth_headers(user_token),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_regular_user_cannot_delete_session_task(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        user_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Regular users should be forbidden from deleting session-tasks."""
        resp = await client.delete(
            _url(conference.id, f"/session-tasks/{session_task.id}"),
            headers=auth_headers(user_token),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_regular_user_cannot_create_volunteer_assignment(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        volunteer: Volunteer,
        user_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Regular users should be forbidden from creating volunteer assignments."""
        payload = {
            "session_volunteer_task_id": str(session_task.id),
            "volunteer_id": str(volunteer.id),
        }
        resp = await client.post(
            _url(conference.id, "/volunteer-assignments"), json=payload, headers=auth_headers(user_token)
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_regular_user_cannot_delete_volunteer_assignment(
        self,
        client: AsyncClient,
        conference: Conference,
        assignment: VolunteerAssignment,
        user_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Regular users should be forbidden from removing volunteer assignments."""
        resp = await client.delete(
            _url(conference.id, f"/volunteer-assignments/{assignment.id}"),
            headers=auth_headers(user_token),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_regular_user_cannot_set_volunteer_color(
        self,
        client: AsyncClient,
        conference: Conference,
        volunteer: Volunteer,
        user_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Regular users should be forbidden from setting volunteer colors."""
        resp = await client.patch(
            _url(conference.id, f"/volunteers/{volunteer.id}/color"),
            json={"color": "#FF0000"},
            headers=auth_headers(user_token),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_regular_user_can_read_volunteer_schedule(
        self,
        client: AsyncClient,
        conference: Conference,
        user_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Regular users should be able to read volunteer schedules."""
        resp = await client.get(_url(conference.id, "/volunteer-schedule"), headers=auth_headers(user_token))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_regular_user_can_read_unassigned_sessions(
        self,
        client: AsyncClient,
        conference: Conference,
        user_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Regular users should be able to read unassigned sessions."""
        resp = await client.get(_url(conference.id, "/volunteer-schedule/unassigned"), headers=auth_headers(user_token))
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_super_admin_access_session_tasks(
        self,
        client: AsyncClient,
        conference: Conference,
        super_admin_user: User,
        tenant_with_vol_module: Tenant,
    ):
        """Super admins without tenant context get 404 for tenant-scoped resources."""
        token = _make_token(super_admin_user)
        resp = await client.get(_url(conference.id, "/session-tasks"), headers=auth_headers(token))
        # Super admins have no tenant_id, so tenant-scoped lookups return 404
        assert resp.status_code in (200, 404)


# =====================================================================
# 2. Multi-Task and Multi-Session Scenarios
# =====================================================================


class TestMultiTaskScenarios:
    """Tests for multiple tasks on a single session and across sessions."""

    @pytest.mark.asyncio
    async def test_two_tasks_on_same_session(
        self,
        client: AsyncClient,
        conference: Conference,
        session: ProgramSession,
        vol_role: VolunteerRole,
        vol_role_2: VolunteerRole,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Two different tasks can be assigned to the same session."""
        payload_1 = {
            "session_id": str(session.id),
            "volunteer_task_id": str(vol_role.id),
            "required_count": 2,
        }
        resp1 = await client.post(
            _url(conference.id, "/session-tasks"), json=payload_1, headers=auth_headers(admin_token)
        )
        assert resp1.status_code == 200

        payload_2 = {
            "session_id": str(session.id),
            "volunteer_task_id": str(vol_role_2.id),
            "required_count": 1,
        }
        resp2 = await client.post(
            _url(conference.id, "/session-tasks"), json=payload_2, headers=auth_headers(admin_token)
        )
        assert resp2.status_code == 200

        # List should show one session group with 2 tasks
        resp_list = await client.get(_url(conference.id, "/session-tasks"), headers=auth_headers(admin_token))
        data = resp_list.json()
        assert data["total"] == 2
        assert len(data["items"]) == 1  # grouped by session
        assert len(data["items"][0]["tasks"]) == 2
        task_names = {t["volunteer_task_name"] for t in data["items"][0]["tasks"]}
        assert task_names == {"Registration Desk", "AV Support"}

    @pytest.mark.asyncio
    async def test_same_task_on_different_sessions(
        self,
        client: AsyncClient,
        conference: Conference,
        session: ProgramSession,
        session_2: ProgramSession,
        vol_role: VolunteerRole,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """The same task type can be assigned to different sessions."""
        for sess in (session, session_2):
            payload = {
                "session_id": str(sess.id),
                "volunteer_task_id": str(vol_role.id),
                "required_count": 1,
            }
            resp = await client.post(
                _url(conference.id, "/session-tasks"), json=payload, headers=auth_headers(admin_token)
            )
            assert resp.status_code == 200

        # List should show two session groups, each with 1 task
        resp_list = await client.get(_url(conference.id, "/session-tasks"), headers=auth_headers(admin_token))
        data = resp_list.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

    @pytest.mark.asyncio
    async def test_overview_groups_by_task(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        session: ProgramSession,
        session_2: ProgramSession,
        vol_role: VolunteerRole,
        vol_role_2: VolunteerRole,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """The volunteer-assignments overview should group items by volunteer task."""
        # Create session tasks: vol_role on both sessions, vol_role_2 on session only
        for sess in (session, session_2):
            db_session.add(
                SessionVolunteerTask(
                    id=uuid.uuid4(),
                    tenant_id=tenant.id,
                    conference_id=conference.id,
                    session_id=sess.id,
                    volunteer_task_id=vol_role.id,
                    required_count=1,
                )
            )
        db_session.add(
            SessionVolunteerTask(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                conference_id=conference.id,
                session_id=session.id,
                volunteer_task_id=vol_role_2.id,
                required_count=1,
            )
        )
        await db_session.commit()

        resp = await client.get(_url(conference.id, "/volunteer-assignments"), headers=auth_headers(admin_token))
        data = resp.json()
        assert len(data["items"]) == 2  # Two tasks
        task_names = {item["volunteer_task_name"] for item in data["items"]}
        assert task_names == {"Registration Desk", "AV Support"}

        # Registration Desk should have 2 sessions
        reg_desk = next(item for item in data["items"] if item["volunteer_task_name"] == "Registration Desk")
        assert len(reg_desk["sessions"]) == 2

        # AV Support should have 1 session
        av_support = next(item for item in data["items"] if item["volunteer_task_name"] == "AV Support")
        assert len(av_support["sessions"]) == 1


# =====================================================================
# 3. Schedule Detail Validation
# =====================================================================


class TestScheduleDetails:
    """Tests verifying day_name, start_time, end_time, track_name in schedule responses."""

    @pytest.mark.asyncio
    async def test_schedule_contains_day_and_time_details(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment: VolunteerAssignment,
        volunteer: Volunteer,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Schedule entries should contain correct day name, date, times, and track name."""
        resp = await client.get(
            _url(conference.id, f"/volunteer-schedule/{volunteer.id}"), headers=auth_headers(admin_token)
        )
        assert resp.status_code == 200
        data = resp.json()
        entry = data["entries"][0]
        assert entry["day_name"] == "Day 1"
        assert entry["day_date"] == "2026-06-01"
        assert entry["start_time"] == "09:00"
        assert entry["end_time"] == "10:00"
        assert entry["track_name"] == "Track A"
        assert entry["task_name"] == "Registration Desk"
        assert entry["session_title"] == "Opening Keynote"

    @pytest.mark.asyncio
    async def test_multi_slot_session_shows_expanded_end_time(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        multi_slot_session: ProgramSession,
        vol_role: VolunteerRole,
        volunteer: Volunteer,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """A session spanning 2 slots (09:00-10:00 + 10:00-11:00) should show end_time as 11:00."""
        svt = SessionVolunteerTask(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            session_id=multi_slot_session.id,
            volunteer_task_id=vol_role.id,
            required_count=1,
        )
        db_session.add(svt)
        await db_session.flush()
        db_session.add(
            VolunteerAssignment(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                conference_id=conference.id,
                session_volunteer_task_id=svt.id,
                volunteer_id=volunteer.id,
            )
        )
        await db_session.commit()

        resp = await client.get(
            _url(conference.id, f"/volunteer-schedule/{volunteer.id}"), headers=auth_headers(admin_token)
        )
        data = resp.json()
        entry = data["entries"][0]
        assert entry["start_time"] == "09:00"
        assert entry["end_time"] == "11:00"
        assert entry["session_title"] == "Full Morning Tutorial"

    @pytest.mark.asyncio
    async def test_schedule_entries_sorted_by_day_and_time(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        session: ProgramSession,
        session_day2: ProgramSession,
        vol_role: VolunteerRole,
        volunteer: Volunteer,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Schedule entries should be sorted by day_date then start_time."""
        # Create tasks and assignments for both sessions
        for sess in (session, session_day2):
            svt = SessionVolunteerTask(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                conference_id=conference.id,
                session_id=sess.id,
                volunteer_task_id=vol_role.id,
                required_count=1,
            )
            db_session.add(svt)
            await db_session.flush()
            db_session.add(
                VolunteerAssignment(
                    id=uuid.uuid4(),
                    tenant_id=tenant.id,
                    conference_id=conference.id,
                    session_volunteer_task_id=svt.id,
                    volunteer_id=volunteer.id,
                )
            )
        await db_session.commit()

        resp = await client.get(
            _url(conference.id, f"/volunteer-schedule/{volunteer.id}"), headers=auth_headers(admin_token)
        )
        data = resp.json()
        entries = data["entries"]
        assert len(entries) == 2
        # Day 1 (2026-06-01) should come before Day 2 (2026-06-02)
        assert entries[0]["day_date"] == "2026-06-01"
        assert entries[1]["day_date"] == "2026-06-02"

    @pytest.mark.asyncio
    async def test_overview_includes_time_and_track(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment: VolunteerAssignment,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """The volunteer-assignments overview should include time and track details for sessions."""
        resp = await client.get(_url(conference.id, "/volunteer-assignments"), headers=auth_headers(admin_token))
        data = resp.json()
        sess_detail = data["items"][0]["sessions"][0]
        assert sess_detail["day_name"] == "Day 1"
        assert sess_detail["start_time"] == "09:00"
        assert sess_detail["end_time"] == "10:00"
        assert sess_detail["track_name"] == "Track A"
        assert sess_detail["session_title"] == "Opening Keynote"
        assert sess_detail["required_count"] == 2


# =====================================================================
# 4. Schedule List and Unassigned Count
# =====================================================================


class TestScheduleListAndUnassigned:
    """Tests for the volunteer-schedule list endpoint and its unassigned_count."""

    @pytest.mark.asyncio
    async def test_schedule_list_includes_unassigned_count(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """The schedule list should report the number of under-staffed session-tasks."""
        resp = await client.get(_url(conference.id, "/volunteer-schedule"), headers=auth_headers(admin_token))
        data = resp.json()
        # session_task requires 2, 0 assigned => 1 unassigned task
        assert data["unassigned_count"] == 1

    @pytest.mark.asyncio
    async def test_schedule_list_unassigned_count_zero_when_fully_staffed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        session: ProgramSession,
        vol_role: VolunteerRole,
        volunteer: Volunteer,
        volunteer_2: Volunteer,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """When all tasks are fully staffed, unassigned_count should be 0."""
        svt = SessionVolunteerTask(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            session_id=session.id,
            volunteer_task_id=vol_role.id,
            required_count=2,
        )
        db_session.add(svt)
        await db_session.flush()
        for vol in (volunteer, volunteer_2):
            db_session.add(
                VolunteerAssignment(
                    id=uuid.uuid4(),
                    tenant_id=tenant.id,
                    conference_id=conference.id,
                    session_volunteer_task_id=svt.id,
                    volunteer_id=vol.id,
                )
            )
        await db_session.commit()

        resp = await client.get(_url(conference.id, "/volunteer-schedule"), headers=auth_headers(admin_token))
        data = resp.json()
        assert data["unassigned_count"] == 0
        assert len(data["items"]) == 2  # Two volunteers have schedules

    @pytest.mark.asyncio
    async def test_unassigned_partial_staffing(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment: VolunteerAssignment,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """A task requiring 2 volunteers but only 1 assigned is still in unassigned list."""
        resp = await client.get(
            _url(conference.id, "/volunteer-schedule/unassigned"), headers=auth_headers(admin_token)
        )
        data = resp.json()
        assert data["total"] == 1
        item = data["items"][0]
        assert item["required_count"] == 2
        assert item["assigned_count"] == 1
        assert item["task_name"] == "Registration Desk"
        assert item["session_title"] == "Opening Keynote"

    @pytest.mark.asyncio
    async def test_multiple_volunteers_in_schedule_list(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        session: ProgramSession,
        vol_role: VolunteerRole,
        volunteer: Volunteer,
        volunteer_2: Volunteer,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Schedule list returns separate entries for each volunteer, sorted by name."""
        svt = SessionVolunteerTask(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            session_id=session.id,
            volunteer_task_id=vol_role.id,
            required_count=2,
        )
        db_session.add(svt)
        await db_session.flush()
        for vol in (volunteer, volunteer_2):
            db_session.add(
                VolunteerAssignment(
                    id=uuid.uuid4(),
                    tenant_id=tenant.id,
                    conference_id=conference.id,
                    session_volunteer_task_id=svt.id,
                    volunteer_id=vol.id,
                )
            )
        await db_session.commit()

        resp = await client.get(_url(conference.id, "/volunteer-schedule"), headers=auth_headers(admin_token))
        data = resp.json()
        names = [item["volunteer_name"] for item in data["items"]]
        assert names == sorted(names)  # sorted alphabetically
        assert len(names) == 2


# =====================================================================
# 5. Boundary and Validation Cases
# =====================================================================


class TestBoundaryAndValidation:
    """Tests for boundary values and input validation."""

    @pytest.mark.asyncio
    async def test_create_session_task_min_required_count(
        self,
        client: AsyncClient,
        conference: Conference,
        session: ProgramSession,
        vol_role: VolunteerRole,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """required_count=1 (minimum) should be accepted."""
        payload = {
            "session_id": str(session.id),
            "volunteer_task_id": str(vol_role.id),
            "required_count": 1,
        }
        resp = await client.post(_url(conference.id, "/session-tasks"), json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert resp.json()["required_count"] == 1

    @pytest.mark.asyncio
    async def test_create_session_task_max_required_count(
        self,
        client: AsyncClient,
        conference: Conference,
        session: ProgramSession,
        vol_role: VolunteerRole,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """required_count=50 (maximum per schema) should be accepted."""
        payload = {
            "session_id": str(session.id),
            "volunteer_task_id": str(vol_role.id),
            "required_count": 50,
        }
        resp = await client.post(_url(conference.id, "/session-tasks"), json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert resp.json()["required_count"] == 50

    @pytest.mark.asyncio
    async def test_create_session_task_required_count_zero_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        session: ProgramSession,
        vol_role: VolunteerRole,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """required_count=0 should be rejected by schema validation (ge=1)."""
        payload = {
            "session_id": str(session.id),
            "volunteer_task_id": str(vol_role.id),
            "required_count": 0,
        }
        resp = await client.post(_url(conference.id, "/session-tasks"), json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_create_session_task_required_count_over_max_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        session: ProgramSession,
        vol_role: VolunteerRole,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """required_count=51 should be rejected by schema validation (le=50)."""
        payload = {
            "session_id": str(session.id),
            "volunteer_task_id": str(vol_role.id),
            "required_count": 51,
        }
        resp = await client.post(_url(conference.id, "/session-tasks"), json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_update_required_count_zero_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Updating required_count to 0 should fail schema validation."""
        resp = await client.put(
            _url(conference.id, f"/session-tasks/{session_task.id}"),
            json={"required_count": 0},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_update_preserves_assigned_count(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment: VolunteerAssignment,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Updating required_count should not reset the assigned_count."""
        resp = await client.put(
            _url(conference.id, f"/session-tasks/{session_task.id}"),
            json={"required_count": 5},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["required_count"] == 5
        assert resp.json()["assigned_count"] == 1  # assignment fixture gives us 1

    @pytest.mark.asyncio
    async def test_color_empty_string_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        volunteer: Volunteer,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """An empty string is not a valid hex color."""
        resp = await client.patch(
            _url(conference.id, f"/volunteers/{volunteer.id}/color"),
            json={"color": ""},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_color_short_hex_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        volunteer: Volunteer,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """A 3-digit hex color like #FFF is not accepted (pattern requires 6 digits)."""
        resp = await client.patch(
            _url(conference.id, f"/volunteers/{volunteer.id}/color"),
            json={"color": "#FFF"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_volunteer_color_nonexistent_volunteer(
        self,
        client: AsyncClient,
        conference: Conference,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Setting color on a non-existent volunteer returns 404."""
        resp = await client.patch(
            _url(conference.id, f"/volunteers/{uuid.uuid4()}/color"),
            json={"color": "#AABBCC"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


# =====================================================================
# 6. Cross-Conference Isolation
# =====================================================================


class TestCrossConferenceIsolation:
    """Tests ensuring data from one conference doesn't leak into another."""

    @pytest.mark.asyncio
    async def test_session_tasks_scoped_to_conference(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        session_task: SessionVolunteerTask,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Session tasks for conference A should not appear when querying conference B."""
        # Create a second conference
        conf_b = Conference(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Other Conf",
            abbreviation="OC",
            is_active=True,
        )
        db_session.add(conf_b)
        await db_session.commit()

        resp = await client.get(_url(conf_b.id, "/session-tasks"), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert resp.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_volunteer_schedule_scoped_to_conference(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment: VolunteerAssignment,
        volunteer: Volunteer,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Volunteer schedule for conference A should not appear in conference B."""
        conf_b = Conference(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Other Conf 2",
            abbreviation="OC2",
            is_active=True,
        )
        db_session.add(conf_b)
        await db_session.flush()
        # Link volunteer to conf_b as well
        db_session.add(ConferenceVolunteer(conference_id=conf_b.id, volunteer_id=volunteer.id))
        await db_session.commit()

        resp = await client.get(
            _url(conf_b.id, f"/volunteer-schedule/{volunteer.id}"), headers=auth_headers(admin_token)
        )
        assert resp.status_code == 200
        assert resp.json()["entries"] == []

    @pytest.mark.asyncio
    async def test_unassigned_sessions_scoped_to_conference(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant: Tenant,
        conference: Conference,
        session_task: SessionVolunteerTask,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Unassigned sessions from conference A should not appear in conference B."""
        conf_b = Conference(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            name="Other Conf 3",
            abbreviation="OC3",
            is_active=True,
        )
        db_session.add(conf_b)
        await db_session.commit()

        resp = await client.get(_url(conf_b.id, "/volunteer-schedule/unassigned"), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


# =====================================================================
# 7. PDF Export Edge Cases
# =====================================================================


class TestPdfExportEdgeCases:
    """Tests for PDF export boundary conditions."""

    @pytest.mark.asyncio
    async def test_pdf_empty_schedule_for_existing_volunteer(
        self,
        client: AsyncClient,
        conference: Conference,
        volunteer: Volunteer,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """PDF for a volunteer with no assignments should still return a valid PDF."""
        resp = await client.get(
            _url(conference.id, f"/volunteer-schedule/{volunteer.id}/pdf"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert b"%PDF" in resp.content[:10]

    @pytest.mark.asyncio
    async def test_pdf_nonexistent_volunteer_returns_404(
        self,
        client: AsyncClient,
        conference: Conference,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """PDF for a non-existent volunteer should return 404."""
        resp = await client.get(
            _url(conference.id, f"/volunteer-schedule/{uuid.uuid4()}/pdf"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_zip_empty_when_no_assignments(
        self,
        client: AsyncClient,
        conference: Conference,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """ZIP download when there are no volunteer assignments should still return a valid ZIP."""
        resp = await client.get(
            _url(conference.id, "/volunteer-schedules-pdf"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"
        # ZIP with no entries is still a valid ZIP (just headers)
        assert resp.content[:2] == b"PK"

    @pytest.mark.asyncio
    async def test_pdf_with_color_set(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment: VolunteerAssignment,
        volunteer: Volunteer,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """PDF should generate successfully when the volunteer has a color set."""
        # Set a color first
        await client.patch(
            _url(conference.id, f"/volunteers/{volunteer.id}/color"),
            json={"color": "#10B981"},
            headers=auth_headers(admin_token),
        )

        resp = await client.get(
            _url(conference.id, f"/volunteer-schedule/{volunteer.id}/pdf"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert b"%PDF" in resp.content[:10]
