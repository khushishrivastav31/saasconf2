"""Tests for volunteer task assignment endpoints."""

import datetime
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.cfp_applicants import CFPApplicant
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.models.settings import UserRole, UserRoleAssignment, VolunteerRole
from app.models.tenant import Tenant
from app.models.user import User
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
        id=uuid.uuid4(), name="Volunteers", code="volunteers", description="Volunteer management", is_active=True
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
async def session(
    db_session: AsyncSession, tenant: Tenant, conference: Conference, time_slot: ProgramTimeSlot, track: ProgramTrack
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
async def volunteer_user_role(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> UserRole:
    role = UserRole(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Volunteer",
        is_system=True,
        is_active=True,
    )
    db_session.add(role)
    await db_session.commit()
    return role


@pytest_asyncio.fixture()
async def volunteer(
    db_session: AsyncSession, tenant: Tenant, conference: Conference, volunteer_user_role: UserRole
) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="vol1@test.com",
        first_name="Alice",
        last_name="Smith",
    )
    db_session.add(a)
    await db_session.flush()
    db_session.add(
        UserRoleAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            user_role_id=volunteer_user_role.id,
            applicant_id=a.id,
        )
    )
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def volunteer_2(
    db_session: AsyncSession, tenant: Tenant, conference: Conference, volunteer_user_role: UserRole
) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="vol2@test.com",
        first_name="Bob",
        last_name="Jones",
    )
    db_session.add(a)
    await db_session.flush()
    db_session.add(
        UserRoleAssignment(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            user_role_id=volunteer_user_role.id,
            applicant_id=a.id,
        )
    )
    await db_session.commit()
    return a


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
    volunteer: CFPApplicant,
) -> VolunteerAssignment:
    a = VolunteerAssignment(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        session_volunteer_task_id=session_task.id,
        applicant_id=volunteer.id,
    )
    db_session.add(a)
    await db_session.commit()
    return a


# =====================================================================
# Session-Task CRUD
# =====================================================================


class TestListSessionTasks:
    @pytest.mark.asyncio
    async def test_list_empty(
        self, client: AsyncClient, conference: Conference, admin_token: str, tenant_with_vol_module: Tenant
    ):
        resp = await client.get(_url(conference.id, "/session-tasks"), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_list_with_data(
        self,
        client: AsyncClient,
        conference: Conference,
        admin_token: str,
        tenant_with_vol_module: Tenant,
        session_task: SessionVolunteerTask,
    ):
        resp = await client.get(_url(conference.id, "/session-tasks"), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["session_id"] == str(session_task.session_id)
        assert len(data["items"][0]["tasks"]) == 1
        assert data["items"][0]["tasks"][0]["volunteer_task_name"] == "Registration Desk"


class TestCreateSessionTask:
    @pytest.mark.asyncio
    async def test_create_success(
        self,
        client: AsyncClient,
        conference: Conference,
        session: ProgramSession,
        vol_role: VolunteerRole,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        payload = {
            "session_id": str(session.id),
            "volunteer_task_id": str(vol_role.id),
            "required_count": 3,
        }
        resp = await client.post(_url(conference.id, "/session-tasks"), json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["session_id"] == str(session.id)
        assert data["volunteer_task_id"] == str(vol_role.id)
        assert data["required_count"] == 3
        assert data["assigned_count"] == 0
        assert data["volunteer_task_name"] == "Registration Desk"

    @pytest.mark.asyncio
    async def test_create_duplicate_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        session: ProgramSession,
        vol_role: VolunteerRole,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        payload = {
            "session_id": str(session.id),
            "volunteer_task_id": str(vol_role.id),
            "required_count": 1,
        }
        resp = await client.post(_url(conference.id, "/session-tasks"), json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_create_session_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        vol_role: VolunteerRole,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        payload = {
            "session_id": str(uuid.uuid4()),
            "volunteer_task_id": str(vol_role.id),
            "required_count": 1,
        }
        resp = await client.post(_url(conference.id, "/session-tasks"), json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_task_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        session: ProgramSession,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        payload = {
            "session_id": str(session.id),
            "volunteer_task_id": str(uuid.uuid4()),
            "required_count": 1,
        }
        resp = await client.post(_url(conference.id, "/session-tasks"), json=payload, headers=auth_headers(admin_token))
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_regular_user_forbidden(
        self,
        client: AsyncClient,
        conference: Conference,
        session: ProgramSession,
        vol_role: VolunteerRole,
        user_token: str,
        tenant_with_vol_module: Tenant,
    ):
        payload = {
            "session_id": str(session.id),
            "volunteer_task_id": str(vol_role.id),
            "required_count": 1,
        }
        resp = await client.post(_url(conference.id, "/session-tasks"), json=payload, headers=auth_headers(user_token))
        assert resp.status_code == 403


class TestUpdateSessionTask:
    @pytest.mark.asyncio
    async def test_update_required_count(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        resp = await client.put(
            _url(conference.id, f"/session-tasks/{session_task.id}"),
            json={"required_count": 5},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["required_count"] == 5

    @pytest.mark.asyncio
    async def test_update_not_found(
        self, client: AsyncClient, conference: Conference, admin_token: str, tenant_with_vol_module: Tenant
    ):
        resp = await client.put(
            _url(conference.id, f"/session-tasks/{uuid.uuid4()}"),
            json={"required_count": 5},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


class TestDeleteSessionTask:
    @pytest.mark.asyncio
    async def test_delete_success(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        resp = await client.delete(
            _url(conference.id, f"/session-tasks/{session_task.id}"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert "removed" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_delete_not_found(
        self, client: AsyncClient, conference: Conference, admin_token: str, tenant_with_vol_module: Tenant
    ):
        resp = await client.delete(
            _url(conference.id, f"/session-tasks/{uuid.uuid4()}"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_cascades_assignments(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment: VolunteerAssignment,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        # Delete the session-task, which should cascade-delete the assignment
        resp = await client.delete(
            _url(conference.id, f"/session-tasks/{session_task.id}"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200

        # Verify session-tasks list is now empty
        resp2 = await client.get(_url(conference.id, "/session-tasks"), headers=auth_headers(admin_token))
        assert resp2.json()["total"] == 0


# =====================================================================
# Volunteer Assignment CRUD
# =====================================================================


class TestListVolunteerAssignments:
    @pytest.mark.asyncio
    async def test_overview_empty(
        self, client: AsyncClient, conference: Conference, admin_token: str, tenant_with_vol_module: Tenant
    ):
        resp = await client.get(_url(conference.id, "/volunteer-assignments"), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert resp.json()["items"] == []

    @pytest.mark.asyncio
    async def test_overview_with_assignment(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment: VolunteerAssignment,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        resp = await client.get(_url(conference.id, "/volunteer-assignments"), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 1
        task_overview = data["items"][0]
        assert task_overview["volunteer_task_name"] == "Registration Desk"
        assert len(task_overview["sessions"]) == 1
        sess = task_overview["sessions"][0]
        assert len(sess["assigned_volunteers"]) == 1
        assert sess["assigned_volunteers"][0]["volunteer_name"] == "Alice Smith"


class TestCreateVolunteerAssignment:
    @pytest.mark.asyncio
    async def test_assign_success(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        volunteer: CFPApplicant,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        payload = {
            "session_volunteer_task_id": str(session_task.id),
            "applicant_id": str(volunteer.id),
        }
        resp = await client.post(
            _url(conference.id, "/volunteer-assignments"), json=payload, headers=auth_headers(admin_token)
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["applicant_id"] == str(volunteer.id)
        assert data["volunteer_name"] == "Alice Smith"
        assert data["session_volunteer_task_id"] == str(session_task.id)

    @pytest.mark.asyncio
    async def test_assign_duplicate_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        volunteer: CFPApplicant,
        assignment: VolunteerAssignment,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        payload = {
            "session_volunteer_task_id": str(session_task.id),
            "applicant_id": str(volunteer.id),
        }
        resp = await client.post(
            _url(conference.id, "/volunteer-assignments"), json=payload, headers=auth_headers(admin_token)
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_assign_svt_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        volunteer: CFPApplicant,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        payload = {
            "session_volunteer_task_id": str(uuid.uuid4()),
            "applicant_id": str(volunteer.id),
        }
        resp = await client.post(
            _url(conference.id, "/volunteer-assignments"), json=payload, headers=auth_headers(admin_token)
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_assign_volunteer_not_found(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        payload = {
            "session_volunteer_task_id": str(session_task.id),
            "applicant_id": str(uuid.uuid4()),
        }
        resp = await client.post(
            _url(conference.id, "/volunteer-assignments"), json=payload, headers=auth_headers(admin_token)
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_assign_volunteer_not_linked(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        session_task: SessionVolunteerTask,
        tenant: Tenant,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """Applicant exists but has no Volunteer role for this conference."""
        v = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            email="unlinked@test.com",
            first_name="Unlinked",
            last_name="Vol",
        )
        db_session.add(v)
        await db_session.commit()

        payload = {
            "session_volunteer_task_id": str(session_task.id),
            "applicant_id": str(v.id),
        }
        resp = await client.post(
            _url(conference.id, "/volunteer-assignments"), json=payload, headers=auth_headers(admin_token)
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_assign_multiple_volunteers(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        volunteer: CFPApplicant,
        volunteer_2: CFPApplicant,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        # Assign first volunteer
        resp1 = await client.post(
            _url(conference.id, "/volunteer-assignments"),
            json={"session_volunteer_task_id": str(session_task.id), "applicant_id": str(volunteer.id)},
            headers=auth_headers(admin_token),
        )
        assert resp1.status_code == 200

        # Assign second volunteer
        resp2 = await client.post(
            _url(conference.id, "/volunteer-assignments"),
            json={"session_volunteer_task_id": str(session_task.id), "applicant_id": str(volunteer_2.id)},
            headers=auth_headers(admin_token),
        )
        assert resp2.status_code == 200

        # Check both show up in overview
        resp3 = await client.get(_url(conference.id, "/volunteer-assignments"), headers=auth_headers(admin_token))
        data = resp3.json()
        vols = data["items"][0]["sessions"][0]["assigned_volunteers"]
        assert len(vols) == 2
        vol_names = {v["volunteer_name"] for v in vols}
        assert vol_names == {"Alice Smith", "Bob Jones"}


class TestDeleteVolunteerAssignment:
    @pytest.mark.asyncio
    async def test_unassign_success(
        self,
        client: AsyncClient,
        conference: Conference,
        assignment: VolunteerAssignment,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        resp = await client.delete(
            _url(conference.id, f"/volunteer-assignments/{assignment.id}"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert "unassigned" in resp.json()["message"].lower()

    @pytest.mark.asyncio
    async def test_unassign_not_found(
        self, client: AsyncClient, conference: Conference, admin_token: str, tenant_with_vol_module: Tenant
    ):
        resp = await client.delete(
            _url(conference.id, f"/volunteer-assignments/{uuid.uuid4()}"),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


# =====================================================================
# Volunteer Color
# =====================================================================


class TestVolunteerColor:
    @pytest.mark.asyncio
    async def test_set_color(
        self,
        client: AsyncClient,
        conference: Conference,
        volunteer: CFPApplicant,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        resp = await client.patch(
            _url(conference.id, f"/volunteers/{volunteer.id}/color"),
            json={"color": "#3B82F6"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["color"] == "#3B82F6"

    @pytest.mark.asyncio
    async def test_invalid_color_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        volunteer: CFPApplicant,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        resp = await client.patch(
            _url(conference.id, f"/volunteers/{volunteer.id}/color"),
            json={"color": "not-a-color"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_color_not_linked(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        v = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            email="nope@test.com",
            first_name="X",
            last_name="Y",
        )
        db_session.add(v)
        await db_session.commit()

        resp = await client.patch(
            _url(conference.id, f"/volunteers/{v.id}/color"),
            json={"color": "#000000"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_color_persists_in_overview(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment: VolunteerAssignment,
        volunteer: CFPApplicant,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        # Set color
        await client.patch(
            _url(conference.id, f"/volunteers/{volunteer.id}/color"),
            json={"color": "#10B981"},
            headers=auth_headers(admin_token),
        )

        # Check it appears in overview
        resp = await client.get(_url(conference.id, "/volunteer-assignments"), headers=auth_headers(admin_token))
        vol_data = resp.json()["items"][0]["sessions"][0]["assigned_volunteers"][0]
        assert vol_data["volunteer_color"] == "#10B981"


# =====================================================================
# Volunteer Schedule
# =====================================================================


class TestVolunteerSchedule:
    @pytest.mark.asyncio
    async def test_schedule_empty(
        self, client: AsyncClient, conference: Conference, admin_token: str, tenant_with_vol_module: Tenant
    ):
        resp = await client.get(_url(conference.id, "/volunteer-schedule"), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []

    @pytest.mark.asyncio
    async def test_schedule_with_assignment(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment: VolunteerAssignment,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        resp = await client.get(_url(conference.id, "/volunteer-schedule"), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) == 1
        schedule = data["items"][0]
        assert schedule["volunteer_name"] == "Alice Smith"
        assert len(schedule["entries"]) == 1
        entry = schedule["entries"][0]
        assert entry["session_title"] == "Opening Keynote"
        assert entry["task_name"] == "Registration Desk"

    @pytest.mark.asyncio
    async def test_single_schedule(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment: VolunteerAssignment,
        volunteer: CFPApplicant,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        resp = await client.get(
            _url(conference.id, f"/volunteer-schedule/{volunteer.id}"), headers=auth_headers(admin_token)
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["volunteer_name"] == "Alice Smith"
        assert len(data["entries"]) == 1

    @pytest.mark.asyncio
    async def test_single_schedule_empty(
        self,
        client: AsyncClient,
        conference: Conference,
        volunteer: CFPApplicant,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        resp = await client.get(
            _url(conference.id, f"/volunteer-schedule/{volunteer.id}"), headers=auth_headers(admin_token)
        )
        assert resp.status_code == 200
        assert resp.json()["entries"] == []

    @pytest.mark.asyncio
    async def test_single_schedule_not_found(
        self, client: AsyncClient, conference: Conference, admin_token: str, tenant_with_vol_module: Tenant
    ):
        resp = await client.get(
            _url(conference.id, f"/volunteer-schedule/{uuid.uuid4()}"), headers=auth_headers(admin_token)
        )
        assert resp.status_code == 404


class TestUnassignedSessions:
    @pytest.mark.asyncio
    async def test_unassigned_with_gap(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        # session_task requires 2 volunteers, 0 assigned => unassigned
        resp = await client.get(
            _url(conference.id, "/volunteer-schedule/unassigned"), headers=auth_headers(admin_token)
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["required_count"] == 2
        assert data["items"][0]["assigned_count"] == 0

    @pytest.mark.asyncio
    async def test_unassigned_none_when_full(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        session: ProgramSession,
        vol_role: VolunteerRole,
        volunteer: CFPApplicant,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        """When required_count=1 and 1 volunteer is assigned, no unassigned."""
        svt = SessionVolunteerTask(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            conference_id=conference.id,
            session_id=session.id,
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
                applicant_id=volunteer.id,
            )
        )
        await db_session.commit()

        resp = await client.get(
            _url(conference.id, "/volunteer-schedule/unassigned"), headers=auth_headers(admin_token)
        )
        assert resp.status_code == 200
        assert resp.json()["total"] == 0


# =====================================================================
# PDF Export
# =====================================================================


class TestPdfExport:
    @pytest.mark.asyncio
    async def test_single_pdf(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment: VolunteerAssignment,
        volunteer: CFPApplicant,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        resp = await client.get(
            _url(conference.id, f"/volunteer-schedule/{volunteer.id}/pdf"), headers=auth_headers(admin_token)
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert b"%PDF" in resp.content[:10]

    @pytest.mark.asyncio
    async def test_all_pdfs_zip(
        self,
        client: AsyncClient,
        conference: Conference,
        session_task: SessionVolunteerTask,
        assignment: VolunteerAssignment,
        admin_token: str,
        tenant_with_vol_module: Tenant,
    ):
        resp = await client.get(_url(conference.id, "/volunteer-schedules-pdf"), headers=auth_headers(admin_token))
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/zip"
        # ZIP magic bytes
        assert resp.content[:2] == b"PK"
