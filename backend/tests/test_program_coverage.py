"""Comprehensive tests for program sessions, publish, days, slots, tracks, and grid endpoints.

Covers:
- Session CRUD (create, list, update, delete, move)
- Session filtering by day and general event
- Enriched sessions endpoint
- Session type association and separately_bookable inheritance
- Day CRUD and duplicate date validation
- Day auto-generate from conference dates
- Slot CRUD, batch creation, validation, and delete-with-sessions guard
- Track CRUD, reorder, and day filtering
- Grid endpoint (per-day and full)
- Publish preview, publish, update, and sessions CSV export
- Auth/permission checks (unauthenticated, wrong module)
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
    CFPStatus,
    PaperStatus,
)
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.models.settings import SessionType
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


# ── URL Helpers ────────────────────────────────────────────────────────


def _days_url(cid: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/days"


def _day_url(cid: uuid.UUID, did: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/days/{did}"


def _slots_url(cid: uuid.UUID, did: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/days/{did}/slots"


def _slots_batch_url(cid: uuid.UUID, did: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/days/{did}/slots/batch"


def _slot_url(cid: uuid.UUID, sid: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/slots/{sid}"


def _tracks_url(cid: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/tracks"


def _track_url(cid: uuid.UUID, tid: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/tracks/{tid}"


def _sessions_url(cid: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/sessions"


def _session_url(cid: uuid.UUID, sid: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/sessions/{sid}"


def _enriched_url(cid: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/sessions/enriched"


def _grid_url(cid: uuid.UUID, did: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/grid/{did}"


def _full_grid_url(cid: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/grid"


def _publish_preview_url(cid: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/publish/preview"


def _publish_url(cid: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/publish"


def _update_url(cid: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/update"


def _export_url(cid: uuid.UUID) -> str:
    return f"/api/v1/conferences/{cid}/program/sessions/export"


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(
        id=uuid.uuid4(),
        name="CoverageTestCorp",
        slug=f"coverage-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def conference(db_session: AsyncSession, tenant: Tenant) -> Conference:
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="CoverageConf 2026",
        abbreviation="CC26",
        is_active=True,
        start_date=date(2026, 7, 1),
        end_date=date(2026, 7, 3),
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def admin_user(db_session: AsyncSession, tenant: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"cov-admin-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Coverage",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture()
async def regular_user(db_session: AsyncSession, tenant: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"cov-user-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Regular",
        last_name="User",
        role=UserRole.USER.value,
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture()
async def modules(db_session: AsyncSession, tenant: Tenant) -> list[Module]:
    """Create program + conferences modules and link to tenant."""
    mods = []
    for code in ("program", "conferences", "cfp"):
        m = Module(id=uuid.uuid4(), name=code.upper(), code=code, is_active=True)
        db_session.add(m)
        mods.append(m)
    await db_session.flush()
    for m in mods:
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=m.id, is_enabled=True))
    await db_session.commit()
    return mods


@pytest.fixture()
def admin_token(admin_user: User) -> str:
    return _make_token(admin_user, modules=["conferences", "program", "cfp"])


@pytest.fixture()
def user_token(regular_user: User) -> str:
    """Token with conferences module only (no program)."""
    return _make_token(regular_user, modules=["conferences"])


@pytest.fixture()
def no_module_token(admin_user: User) -> str:
    """Token with no modules at all."""
    return _make_token(admin_user, modules=[])


@pytest_asyncio.fixture()
async def program_day(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> ProgramDay:
    """Create a single program day."""
    day = ProgramDay(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        date=date(2026, 7, 1),
        name="Day 1",
        sort_order=0,
    )
    db_session.add(day)
    await db_session.commit()
    return day


@pytest_asyncio.fixture()
async def program_slots(db_session: AsyncSession, tenant: Tenant, program_day: ProgramDay) -> list[ProgramTimeSlot]:
    """Create 3 time slots for the program day."""
    slots = []
    for i, (st, et) in enumerate(
        [
            (time(9, 0), time(9, 30)),
            (time(9, 30), time(10, 0)),
            (time(10, 0), time(10, 30)),
        ]
    ):
        s = ProgramTimeSlot(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            program_day_id=program_day.id,
            start_time=st,
            end_time=et,
            sort_order=i,
        )
        db_session.add(s)
        slots.append(s)
    await db_session.commit()
    return slots


@pytest_asyncio.fixture()
async def program_track(
    db_session: AsyncSession, tenant: Tenant, conference: Conference, program_day: ProgramDay
) -> ProgramTrack:
    """Create a single track."""
    track = ProgramTrack(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        program_day_id=program_day.id,
        name="Main Hall",
        sort_order=0,
    )
    db_session.add(track)
    await db_session.commit()
    return track


@pytest_asyncio.fixture()
async def session_type(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> SessionType:
    """Create a session type for the conference."""
    st = SessionType(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Tutorial",
        slug="tutorial",
        duration_minutes=60,
        cfp_eligible=True,
        separately_bookable=True,
        is_active=True,
    )
    db_session.add(st)
    await db_session.commit()
    return st


@pytest_asyncio.fixture()
async def program_session(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    program_slots: list[ProgramTimeSlot],
    program_track: ProgramTrack,
) -> ProgramSession:
    """Create a single session in the grid."""
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        start_slot_id=program_slots[0].id,
        start_track_id=program_track.id,
        title="Keynote Session",
        slot_span=1,
        track_span=1,
        color="#3B82F6",
    )
    db_session.add(s)
    await db_session.commit()
    return s


# ── CFP fixtures for publish tests ────────────────────────────────────


@pytest_asyncio.fixture()
async def cfp(db_session: AsyncSession, tenant: Tenant, conference: Conference) -> CallForPapers:
    c = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        title="Coverage CFP",
        status=CFPStatus.REVIEW.value,
    )
    db_session.add(c)
    await db_session.flush()
    db_session.add(ConferenceCFP(id=uuid.uuid4(), conference_id=conference.id, cfp_id=c.id))
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def speakers(db_session: AsyncSession, tenant: Tenant) -> list[CFPApplicant]:
    result = []
    for first, last in [("Alice", "Speaker"), ("Bob", "Talker")]:
        a = CFPApplicant(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            first_name=first,
            last_name=last,
            email=f"{first.lower()}-{uuid.uuid4().hex[:6]}@test.com",
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
    """Create 2 papers: Paper1 by Alice (will be accepted), Paper2 by Bob (will be rejected)."""
    alice, bob = speakers
    result = []
    for title, speaker in [
        ("AI Frontiers", alice),
        ("Cloud Myths", bob),
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
async def session_with_paper(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    program_slots: list[ProgramTimeSlot],
    program_track: ProgramTrack,
    papers: list[CFPPaper],
) -> ProgramSession:
    """Create a session assigned to paper[0] (Alice's paper)."""
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        start_slot_id=program_slots[0].id,
        start_track_id=program_track.id,
        title=papers[0].title,
        paper_id=papers[0].id,
        slot_span=1,
        track_span=1,
    )
    db_session.add(s)
    await db_session.commit()
    return s


# =====================================================================
# AUTH / PERMISSION TESTS
# =====================================================================


class TestAuthAndPermissions:
    """Verify that endpoints require authentication and the program module."""

    @pytest.mark.asyncio
    async def test_unauthenticated_request_rejected(
        self, client: AsyncClient, conference: Conference, modules: list[Module]
    ) -> None:
        """Requests without auth header should be rejected."""
        resp = await client.get(_sessions_url(conference.id))
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_missing_program_module_rejected(
        self, client: AsyncClient, conference: Conference, modules: list[Module], user_token: str
    ) -> None:
        """Token without 'program' module should be rejected."""
        resp = await client.get(
            _sessions_url(conference.id),
            headers=auth_headers(user_token),
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_no_module_token_rejected_for_days(
        self, client: AsyncClient, conference: Conference, modules: list[Module], no_module_token: str
    ) -> None:
        """Token with no modules should be rejected for day listing."""
        resp = await client.get(
            _days_url(conference.id),
            headers=auth_headers(no_module_token),
        )
        assert resp.status_code == 403


# =====================================================================
# DAY TESTS
# =====================================================================


class TestDays:
    """CRUD tests for program days."""

    @pytest.mark.asyncio
    async def test_create_day(
        self, client: AsyncClient, conference: Conference, modules: list[Module], admin_token: str
    ) -> None:
        resp = await client.post(
            _days_url(conference.id),
            json={"date": "2026-07-01", "name": "Opening Day"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["date"] == "2026-07-01"
        assert data["name"] == "Opening Day"
        assert data["conference_id"] == str(conference.id)

    @pytest.mark.asyncio
    async def test_list_days(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_day: ProgramDay,
    ) -> None:
        resp = await client.get(
            _days_url(conference.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert any(d["id"] == str(program_day.id) for d in data["items"])

    @pytest.mark.asyncio
    async def test_update_day_name(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_day: ProgramDay,
    ) -> None:
        resp = await client.put(
            _day_url(conference.id, program_day.id),
            json={"name": "Renamed Day"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Renamed Day"

    @pytest.mark.asyncio
    async def test_delete_day(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_day: ProgramDay,
    ) -> None:
        resp = await client.delete(
            _day_url(conference.id, program_day.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_duplicate_date_rejected(
        self, client: AsyncClient, conference: Conference, modules: list[Module], admin_token: str
    ) -> None:
        """Creating two days with the same date should fail."""
        await client.post(
            _days_url(conference.id),
            json={"date": "2026-07-05", "name": "Day A"},
            headers=auth_headers(admin_token),
        )
        resp = await client.post(
            _days_url(conference.id),
            json={"date": "2026-07-05", "name": "Day B"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_generate_days_from_conference_dates(
        self, client: AsyncClient, conference: Conference, modules: list[Module], admin_token: str
    ) -> None:
        """Auto-generate days should create days for conference date range."""
        resp = await client.post(
            f"{_days_url(conference.id)}/generate",
            json={"include_pre_conference": False, "include_post_conference": False},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        # Conference is July 1-3, so 3 days
        assert len(data["created"]) == 3
        assert data["skipped"] == 0

    @pytest.mark.asyncio
    async def test_delete_nonexistent_day_returns_404(
        self, client: AsyncClient, conference: Conference, modules: list[Module], admin_token: str
    ) -> None:
        resp = await client.delete(
            _day_url(conference.id, uuid.uuid4()),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


# =====================================================================
# SLOT TESTS
# =====================================================================


class TestSlots:
    """CRUD tests for time slots."""

    @pytest.mark.asyncio
    async def test_create_slot(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_day: ProgramDay,
    ) -> None:
        resp = await client.post(
            _slots_url(conference.id, program_day.id),
            json={"start_time": "11:00:00", "end_time": "11:30:00"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["start_time"] == "11:00:00"
        assert data["is_session_free"] is False

    @pytest.mark.asyncio
    async def test_create_session_free_slot(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_day: ProgramDay,
    ) -> None:
        resp = await client.post(
            _slots_url(conference.id, program_day.id),
            json={"start_time": "12:00:00", "end_time": "13:00:00", "is_session_free": True},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        assert resp.json()["is_session_free"] is True

    @pytest.mark.asyncio
    async def test_list_slots(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_day: ProgramDay,
        program_slots: list[ProgramTimeSlot],
    ) -> None:
        resp = await client.get(
            _slots_url(conference.id, program_day.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3

    @pytest.mark.asyncio
    async def test_update_slot(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_slots: list[ProgramTimeSlot],
    ) -> None:
        resp = await client.put(
            _slot_url(conference.id, program_slots[0].id),
            json={"is_session_free": True},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["is_session_free"] is True

    @pytest.mark.asyncio
    async def test_delete_slot(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_slots: list[ProgramTimeSlot],
    ) -> None:
        # Delete the last slot (no sessions reference it)
        resp = await client.delete(
            _slot_url(conference.id, program_slots[2].id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_slot_with_session_fails(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_session: ProgramSession,
        program_slots: list[ProgramTimeSlot],
    ) -> None:
        """Cannot delete a slot that has sessions placed on it."""
        resp = await client.delete(
            _slot_url(conference.id, program_slots[0].id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_slot_end_before_start_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_day: ProgramDay,
    ) -> None:
        """End time before start time should be rejected."""
        resp = await client.post(
            _slots_url(conference.id, program_day.id),
            json={"start_time": "15:00:00", "end_time": "14:00:00"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_batch_create_slots(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_day: ProgramDay,
    ) -> None:
        """Batch create generates slots at regular intervals."""
        resp = await client.post(
            _slots_batch_url(conference.id, program_day.id),
            json={"start_time": "14:00:00", "end_time": "16:00:00", "interval_minutes": 30},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        # 14:00-16:00 at 30min intervals = 4 slots
        assert data["total"] == 4

    @pytest.mark.asyncio
    async def test_delete_nonexistent_slot_returns_404(
        self, client: AsyncClient, conference: Conference, modules: list[Module], admin_token: str
    ) -> None:
        resp = await client.delete(
            _slot_url(conference.id, uuid.uuid4()),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


# =====================================================================
# TRACK TESTS
# =====================================================================


class TestTracks:
    """CRUD tests for program tracks."""

    @pytest.mark.asyncio
    async def test_create_track(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_day: ProgramDay,
    ) -> None:
        resp = await client.post(
            _tracks_url(conference.id),
            json={"program_day_id": str(program_day.id), "name": "Room A", "sort_order": 0},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "Room A"
        assert data["is_active"] is True

    @pytest.mark.asyncio
    async def test_list_tracks(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_track: ProgramTrack,
    ) -> None:
        resp = await client.get(
            _tracks_url(conference.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_list_tracks_filter_by_day(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_day: ProgramDay,
        program_track: ProgramTrack,
    ) -> None:
        resp = await client.get(
            _tracks_url(conference.id),
            params={"day_id": str(program_day.id)},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert all(t["program_day_id"] == str(program_day.id) for t in data["items"])

    @pytest.mark.asyncio
    async def test_update_track(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_track: ProgramTrack,
    ) -> None:
        resp = await client.put(
            _track_url(conference.id, program_track.id),
            json={"name": "Auditorium B"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Auditorium B"

    @pytest.mark.asyncio
    async def test_delete_track(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_track: ProgramTrack,
    ) -> None:
        resp = await client.delete(
            _track_url(conference.id, program_track.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_nonexistent_track_returns_404(
        self, client: AsyncClient, conference: Conference, modules: list[Module], admin_token: str
    ) -> None:
        resp = await client.delete(
            _track_url(conference.id, uuid.uuid4()),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_reorder_tracks(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        tenant: Tenant,
        modules: list[Module],
        admin_token: str,
        program_day: ProgramDay,
    ) -> None:
        """Reorder tracks and verify new sort_order."""
        # Create 2 tracks via API
        r1 = await client.post(
            _tracks_url(conference.id),
            json={"program_day_id": str(program_day.id), "name": "Track X", "sort_order": 0},
            headers=auth_headers(admin_token),
        )
        r2 = await client.post(
            _tracks_url(conference.id),
            json={"program_day_id": str(program_day.id), "name": "Track Y", "sort_order": 1},
            headers=auth_headers(admin_token),
        )
        t1_id = r1.json()["id"]
        t2_id = r2.json()["id"]

        # Reorder: Y before X
        resp = await client.put(
            f"{_tracks_url(conference.id)}/reorder",
            json={"track_ids": [t2_id, t1_id]},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        ids = [t["id"] for t in items]
        # Track Y should be first
        assert ids.index(t2_id) < ids.index(t1_id)


# =====================================================================
# SESSION TESTS
# =====================================================================


class TestSessions:
    """CRUD tests for program sessions."""

    @pytest.mark.asyncio
    async def test_create_session(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_slots: list[ProgramTimeSlot],
        program_track: ProgramTrack,
    ) -> None:
        resp = await client.post(
            _sessions_url(conference.id),
            json={
                "start_slot_id": str(program_slots[0].id),
                "start_track_id": str(program_track.id),
                "title": "Intro Talk",
                "color": "#EF4444",
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Intro Talk"
        assert data["slot_span"] == 1
        assert data["track_span"] == 1
        assert data["allow_in_session_free"] is False
        assert data["settings"] == {}

    @pytest.mark.asyncio
    async def test_create_session_with_description_and_notes(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_slots: list[ProgramTimeSlot],
        program_track: ProgramTrack,
    ) -> None:
        resp = await client.post(
            _sessions_url(conference.id),
            json={
                "start_slot_id": str(program_slots[1].id),
                "start_track_id": str(program_track.id),
                "title": "Deep Dive",
                "description": "A deep dive session",
                "notes": "Requires AV setup",
                "color": "#10B981",
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["description"] == "A deep dive session"
        assert data["notes"] == "Requires AV setup"

    @pytest.mark.asyncio
    async def test_create_session_with_session_type(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_slots: list[ProgramTimeSlot],
        program_track: ProgramTrack,
        session_type: SessionType,
    ) -> None:
        """Session should inherit separately_bookable from session type."""
        resp = await client.post(
            _sessions_url(conference.id),
            json={
                "start_slot_id": str(program_slots[0].id),
                "start_track_id": str(program_track.id),
                "title": "Tutorial Slot",
                "session_type_id": str(session_type.id),
                "color": "#8B5CF6",
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["session_type_id"] == str(session_type.id)
        assert data["session_type_name"] == "Tutorial"
        assert data["separately_bookable"] is True

    @pytest.mark.asyncio
    async def test_create_general_event_session(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_slots: list[ProgramTimeSlot],
    ) -> None:
        """Create a general event without a track (spans all tracks)."""
        resp = await client.post(
            _sessions_url(conference.id),
            json={
                "start_slot_id": str(program_slots[0].id),
                "title": "Coffee Break",
                "is_general_event": True,
                "color": "#F59E0B",
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["is_general_event"] is True
        assert data["start_track_id"] is None

    @pytest.mark.asyncio
    async def test_list_sessions(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_session: ProgramSession,
    ) -> None:
        resp = await client.get(
            _sessions_url(conference.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert any(s["id"] == str(program_session.id) for s in data["items"])

    @pytest.mark.asyncio
    async def test_list_sessions_filter_by_day(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_day: ProgramDay,
        program_session: ProgramSession,
    ) -> None:
        """Filter sessions by day_id returns only sessions on that day."""
        resp = await client.get(
            _sessions_url(conference.id),
            params={"day_id": str(program_day.id)},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_update_session_title(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_session: ProgramSession,
    ) -> None:
        resp = await client.put(
            _session_url(conference.id, program_session.id),
            json={"title": "Updated Keynote"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated Keynote"

    @pytest.mark.asyncio
    async def test_update_session_color(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_session: ProgramSession,
    ) -> None:
        resp = await client.put(
            _session_url(conference.id, program_session.id),
            json={"color": "#EF4444"},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["color"] == "#EF4444"

    @pytest.mark.asyncio
    async def test_move_session_to_different_slot(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_session: ProgramSession,
        program_slots: list[ProgramTimeSlot],
        program_track: ProgramTrack,
    ) -> None:
        resp = await client.put(
            f"{_session_url(conference.id, program_session.id)}/move",
            json={
                "start_slot_id": str(program_slots[1].id),
                "start_track_id": str(program_track.id),
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["start_slot_id"] == str(program_slots[1].id)

    @pytest.mark.asyncio
    async def test_delete_session(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_session: ProgramSession,
    ) -> None:
        resp = await client.delete(
            _session_url(conference.id, program_session.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_nonexistent_session_returns_404(
        self, client: AsyncClient, conference: Conference, modules: list[Module], admin_token: str
    ) -> None:
        resp = await client.delete(
            _session_url(conference.id, uuid.uuid4()),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_move_session_to_invalid_slot_returns_404(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_session: ProgramSession,
    ) -> None:
        resp = await client.put(
            f"{_session_url(conference.id, program_session.id)}/move",
            json={"start_slot_id": str(uuid.uuid4())},
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_session_with_invalid_slot_returns_404(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_track: ProgramTrack,
    ) -> None:
        resp = await client.post(
            _sessions_url(conference.id),
            json={
                "start_slot_id": str(uuid.uuid4()),
                "start_track_id": str(program_track.id),
                "title": "Invalid Slot Session",
                "color": "#EF4444",
            },
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404


# =====================================================================
# ENRICHED SESSIONS TESTS
# =====================================================================


class TestEnrichedSessions:
    """Tests for the enriched sessions endpoint."""

    @pytest.mark.asyncio
    async def test_enriched_sessions_empty(
        self, client: AsyncClient, conference: Conference, modules: list[Module], admin_token: str
    ) -> None:
        resp = await client.get(
            _enriched_url(conference.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["custom_fields"] == []

    @pytest.mark.asyncio
    async def test_enriched_sessions_returns_day_and_slot_info(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_session: ProgramSession,
        program_day: ProgramDay,
    ) -> None:
        resp = await client.get(
            _enriched_url(conference.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        item = data["items"][0]
        assert item["title"] == "Keynote Session"
        assert item["day_name"] == "Day 1"
        assert item["day_date"] == "2026-07-01"
        assert item["start_time"] == "09:00:00"
        assert item["track_name"] == "Main Hall"


# =====================================================================
# GRID TESTS
# =====================================================================


class TestGrid:
    """Tests for the grid endpoints (per-day and full)."""

    @pytest.mark.asyncio
    async def test_day_grid(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_day: ProgramDay,
        program_slots: list[ProgramTimeSlot],
        program_track: ProgramTrack,
        program_session: ProgramSession,
    ) -> None:
        resp = await client.get(
            _grid_url(conference.id, program_day.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        grid = resp.json()
        assert grid["day"]["id"] == str(program_day.id)
        assert len(grid["slots"]) == 3
        assert len(grid["tracks"]) == 1
        assert len(grid["sessions"]) == 1
        assert grid["sessions"][0]["title"] == "Keynote Session"

    @pytest.mark.asyncio
    async def test_day_grid_nonexistent_day_returns_404(
        self, client: AsyncClient, conference: Conference, modules: list[Module], admin_token: str
    ) -> None:
        resp = await client.get(
            _grid_url(conference.id, uuid.uuid4()),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_full_grid(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_day: ProgramDay,
        program_slots: list[ProgramTimeSlot],
        program_track: ProgramTrack,
        program_session: ProgramSession,
    ) -> None:
        resp = await client.get(
            _full_grid_url(conference.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_days"] >= 1
        day_grid = data["days"][0]
        assert day_grid["day"]["id"] == str(program_day.id)
        assert len(day_grid["sessions"]) == 1

    @pytest.mark.asyncio
    async def test_full_grid_empty_conference(
        self, client: AsyncClient, conference: Conference, modules: list[Module], admin_token: str
    ) -> None:
        """Full grid with no days returns empty list."""
        resp = await client.get(
            _full_grid_url(conference.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_days"] == 0
        assert data["days"] == []


# =====================================================================
# PUBLISH & UPDATE TESTS
# =====================================================================


class TestPublish:
    """Tests for publish preview, publish, and update endpoints."""

    @pytest.mark.asyncio
    async def test_publish_preview(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        session_with_paper: ProgramSession,
        papers: list[CFPPaper],
    ) -> None:
        resp = await client.get(
            _publish_preview_url(conference.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["papers_to_accept"] == 1  # paper[0] is in session
        assert data["papers_to_reject"] == 1  # paper[1] is not
        assert data["already_published"] is False
        assert data["speakers_to_notify"] == 2

    @pytest.mark.asyncio
    async def test_publish_preview_lists_accepted_and_rejected(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        session_with_paper: ProgramSession,
        papers: list[CFPPaper],
    ) -> None:
        resp = await client.get(
            _publish_preview_url(conference.id),
            headers=auth_headers(admin_token),
        )
        data = resp.json()
        accepted_titles = {p["title"] for p in data["accepted_papers"]}
        rejected_titles = {p["title"] for p in data["rejected_papers"]}
        assert papers[0].title in accepted_titles
        assert papers[1].title in rejected_titles

    @pytest.mark.asyncio
    async def test_publish_updates_paper_statuses(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        session_with_paper: ProgramSession,
        papers: list[CFPPaper],
    ) -> None:
        accepted_id = papers[0].id
        rejected_id = papers[1].id

        resp = await client.post(
            _publish_url(conference.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["papers_accepted"] == 1
        assert data["papers_rejected"] == 1
        assert data["published_at"] is not None

        # Verify DB
        r1 = await db_session.execute(select(CFPPaper.status).where(CFPPaper.id == accepted_id))
        assert r1.scalar_one() == PaperStatus.ACCEPTED.value

        r2 = await db_session.execute(select(CFPPaper.status).where(CFPPaper.id == rejected_id))
        assert r2.scalar_one() == PaperStatus.REJECTED.value

    @pytest.mark.asyncio
    async def test_publish_sets_cfp_completed(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        session_with_paper: ProgramSession,
        papers: list[CFPPaper],
        cfp: CallForPapers,
    ) -> None:
        cfp_id = cfp.id
        await client.post(
            _publish_url(conference.id),
            headers=auth_headers(admin_token),
        )
        result = await db_session.execute(select(CallForPapers.status).where(CallForPapers.id == cfp_id))
        assert result.scalar_one() == CFPStatus.COMPLETED.value

    @pytest.mark.asyncio
    async def test_publish_sends_notifications(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        session_with_paper: ProgramSession,
        papers: list[CFPPaper],
    ) -> None:
        resp = await client.post(
            _publish_url(conference.id),
            headers=auth_headers(admin_token),
        )
        data = resp.json()
        assert data["notifications_sent"] > 0

    @pytest.mark.asyncio
    async def test_publish_no_papers_fails(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_day: ProgramDay,
    ) -> None:
        """Publish with no papers should fail validation."""
        resp = await client.post(
            _publish_url(conference.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_update_requires_previous_publish(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        session_with_paper: ProgramSession,
        papers: list[CFPPaper],
    ) -> None:
        """Update endpoint should fail if program was not published yet."""
        resp = await client.post(
            _update_url(conference.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_update_no_changes_sends_zero_notifications(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        session_with_paper: ProgramSession,
        papers: list[CFPPaper],
    ) -> None:
        """Publish then update with no changes should send zero notifications."""
        await client.post(
            _publish_url(conference.id),
            headers=auth_headers(admin_token),
        )
        resp = await client.post(
            _update_url(conference.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert resp.json()["notifications_sent"] == 0

    @pytest.mark.asyncio
    async def test_preview_after_publish_shows_already_published(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        session_with_paper: ProgramSession,
        papers: list[CFPPaper],
    ) -> None:
        await client.post(
            _publish_url(conference.id),
            headers=auth_headers(admin_token),
        )
        resp = await client.get(
            _publish_preview_url(conference.id),
            headers=auth_headers(admin_token),
        )
        assert resp.json()["already_published"] is True


# =====================================================================
# SESSION EXPORT TESTS
# =====================================================================


class TestExport:
    """Tests for the sessions CSV export endpoint."""

    @pytest.mark.asyncio
    async def test_export_returns_csv(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_session: ProgramSession,
    ) -> None:
        resp = await client.get(
            _export_url(conference.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_export_contains_header_row(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_session: ProgramSession,
    ) -> None:
        resp = await client.get(
            _export_url(conference.id),
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
        modules: list[Module],
        admin_token: str,
        program_session: ProgramSession,
    ) -> None:
        resp = await client.get(
            _export_url(conference.id),
            headers=auth_headers(admin_token),
        )
        content = resp.text
        assert "Keynote Session" in content

    @pytest.mark.asyncio
    async def test_export_has_content_disposition(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        program_session: ProgramSession,
    ) -> None:
        resp = await client.get(
            _export_url(conference.id),
            headers=auth_headers(admin_token),
        )
        cd = resp.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert ".csv" in cd

    @pytest.mark.asyncio
    async def test_export_with_paper_session(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
        session_with_paper: ProgramSession,
        papers: list[CFPPaper],
    ) -> None:
        """Export should include paper title and speaker info when session has a paper."""
        resp = await client.get(
            _export_url(conference.id),
            headers=auth_headers(admin_token),
        )
        content = resp.text
        assert papers[0].title in content
        assert "Alice" in content

    @pytest.mark.asyncio
    async def test_export_empty_conference(
        self,
        client: AsyncClient,
        conference: Conference,
        modules: list[Module],
        admin_token: str,
    ) -> None:
        """Export with no sessions should still return a CSV with a header row."""
        resp = await client.get(
            _export_url(conference.id),
            headers=auth_headers(admin_token),
        )
        assert resp.status_code == 200
        content = resp.text
        assert "Session Title" in content
        # Only header row, no data rows (BOM + header)
        lines = content.strip().split("\n")
        assert len(lines) == 1
