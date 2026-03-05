"""Deep coverage tests for program endpoints: days, slots, tracks, sessions, publish.

Targets uncovered happy-path lines in:
- app/api/v1/program/sessions.py
- app/api/v1/program/publish.py
- app/api/v1/program/days.py
- app/api/v1/program/slots.py
- app/api/v1/program/tracks.py
"""

import uuid
from datetime import UTC, date, datetime, time

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.associations import ConferenceCFP
from app.models.cfp import CallForPapers
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper, PaperStatus
from app.models.conference import Conference
from app.models.location import Location
from app.models.module import Module, TenantModule
from app.models.program import ProgramDay, ProgramSession, ProgramTimeSlot, ProgramTrack
from app.models.settings import SessionType
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import _make_token, auth_headers

BASE = "/api/v1/conferences"


# ── Fixtures ──────────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def prog_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="ProgCorp", slug=f"prog-{uuid.uuid4().hex[:8]}", is_active=True)
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def prog_conference(db_session: AsyncSession, prog_tenant: Tenant) -> Conference:
    c = Conference(
        id=uuid.uuid4(),
        tenant_id=prog_tenant.id,
        name="ProgConf 2026",
        abbreviation="PC26",
        is_active=True,
        start_date=date(2026, 6, 1),
        end_date=date(2026, 6, 3),
    )
    db_session.add(c)
    await db_session.commit()
    return c


@pytest_asyncio.fixture()
async def prog_admin(db_session: AsyncSession, prog_tenant: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=prog_tenant.id,
        email=f"progadmin-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="Prog",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture()
async def prog_modules(db_session: AsyncSession, prog_tenant: Tenant) -> dict[str, Module]:
    """Create and enable 'conferences', 'program', and 'cfp' modules for the tenant."""
    mods = {}
    for code, name in [("conferences", "Conferences"), ("program", "Program"), ("cfp", "Call for Papers")]:
        m = Module(id=uuid.uuid4(), name=name, code=code, description=f"{name} module", is_active=True)
        db_session.add(m)
        mods[code] = m
    await db_session.flush()
    for m in mods.values():
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=prog_tenant.id, module_id=m.id, is_enabled=True))
    await db_session.commit()
    return mods


@pytest.fixture()
def prog_token(prog_admin: User) -> str:
    return _make_token(prog_admin, modules=["conferences", "program", "cfp"])


@pytest.fixture()
def prog_headers(prog_token: str) -> dict[str, str]:
    return auth_headers(prog_token)


@pytest_asyncio.fixture()
async def prog_day(db_session: AsyncSession, prog_conference: Conference, prog_tenant: Tenant) -> ProgramDay:
    d = ProgramDay(
        id=uuid.uuid4(),
        tenant_id=prog_tenant.id,
        conference_id=prog_conference.id,
        date=date(2026, 6, 1),
        name="Day 1",
        sort_order=0,
    )
    db_session.add(d)
    await db_session.commit()
    return d


@pytest_asyncio.fixture()
async def prog_slot(db_session: AsyncSession, prog_day: ProgramDay, prog_tenant: Tenant) -> ProgramTimeSlot:
    s = ProgramTimeSlot(
        id=uuid.uuid4(),
        tenant_id=prog_tenant.id,
        program_day_id=prog_day.id,
        start_time=time(9, 0),
        end_time=time(9, 30),
        sort_order=0,
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture()
async def prog_slot2(db_session: AsyncSession, prog_day: ProgramDay, prog_tenant: Tenant) -> ProgramTimeSlot:
    s = ProgramTimeSlot(
        id=uuid.uuid4(),
        tenant_id=prog_tenant.id,
        program_day_id=prog_day.id,
        start_time=time(9, 30),
        end_time=time(10, 0),
        sort_order=1,
    )
    db_session.add(s)
    await db_session.commit()
    return s


@pytest_asyncio.fixture()
async def prog_track(
    db_session: AsyncSession, prog_conference: Conference, prog_tenant: Tenant, prog_day: ProgramDay
) -> ProgramTrack:
    t = ProgramTrack(
        id=uuid.uuid4(),
        tenant_id=prog_tenant.id,
        conference_id=prog_conference.id,
        program_day_id=prog_day.id,
        name="Main Track",
        sort_order=0,
    )
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture()
async def prog_session_type(db_session: AsyncSession, prog_conference: Conference, prog_tenant: Tenant) -> SessionType:
    st = SessionType(
        id=uuid.uuid4(),
        tenant_id=prog_tenant.id,
        conference_id=prog_conference.id,
        name="Talk",
        slug="talk",
        duration_minutes=30,
        cfp_eligible=True,
        separately_bookable=True,
    )
    db_session.add(st)
    await db_session.commit()
    return st


@pytest_asyncio.fixture()
async def prog_location(db_session: AsyncSession, prog_tenant: Tenant) -> Location:
    loc = Location(
        id=uuid.uuid4(),
        tenant_id=prog_tenant.id,
        name="Main Hall",
        location_type="room",
        is_active=True,
    )
    db_session.add(loc)
    await db_session.commit()
    return loc


@pytest_asyncio.fixture()
async def prog_session(
    db_session: AsyncSession,
    prog_conference: Conference,
    prog_tenant: Tenant,
    prog_slot: ProgramTimeSlot,
    prog_track: ProgramTrack,
) -> ProgramSession:
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=prog_tenant.id,
        conference_id=prog_conference.id,
        start_slot_id=prog_slot.id,
        start_track_id=prog_track.id,
        title="Opening Keynote",
        slot_span=1,
        track_span=1,
    )
    db_session.add(s)
    await db_session.commit()
    return s


# CFP fixtures for publish tests


@pytest_asyncio.fixture()
async def prog_applicant(db_session: AsyncSession, prog_tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=prog_tenant.id,
        first_name="Alice",
        last_name="Speaker",
        email="alice@example.com",
        password_hash=hash_password("Pass123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def prog_applicant2(db_session: AsyncSession, prog_tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=prog_tenant.id,
        first_name="Bob",
        last_name="Cospeaker",
        email="bob@example.com",
        password_hash=hash_password("Pass123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def prog_cfp(db_session: AsyncSession, prog_tenant: Tenant, prog_conference: Conference) -> CallForPapers:
    cfp = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=prog_tenant.id,
        title="ProgConf CFP",
        status="open",
    )
    db_session.add(cfp)
    await db_session.flush()
    assoc = ConferenceCFP(
        id=uuid.uuid4(),
        conference_id=prog_conference.id,
        cfp_id=cfp.id,
    )
    db_session.add(assoc)
    await db_session.commit()
    return cfp


@pytest_asyncio.fixture()
async def prog_paper(
    db_session: AsyncSession,
    prog_tenant: Tenant,
    prog_cfp: CallForPapers,
    prog_applicant: CFPApplicant,
    prog_session_type: SessionType,
) -> CFPPaper:
    p = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=prog_tenant.id,
        cfp_id=prog_cfp.id,
        main_speaker_id=prog_applicant.id,
        session_type_id=prog_session_type.id,
        title="My Great Paper",
        abstract_short="Short abstract",
        level="intermediate",
        status=PaperStatus.SUBMITTED.value,
    )
    db_session.add(p)
    await db_session.commit()
    return p


@pytest_asyncio.fixture()
async def prog_paper2(
    db_session: AsyncSession,
    prog_tenant: Tenant,
    prog_cfp: CallForPapers,
    prog_applicant: CFPApplicant,
) -> CFPPaper:
    """A second paper that will NOT be in sessions (will be rejected)."""
    p = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=prog_tenant.id,
        cfp_id=prog_cfp.id,
        main_speaker_id=prog_applicant.id,
        title="Rejected Paper",
        abstract_short="This one gets rejected",
        status=PaperStatus.SUBMITTED.value,
    )
    db_session.add(p)
    await db_session.commit()
    return p


# ═══════════════════════════════════════════════════════════════════════════
# PROGRAM DAYS
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_list_days_empty(client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules):
    url = f"{BASE}/{prog_conference.id}/program/days"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["items"] == []


@pytest.mark.asyncio
async def test_create_day(client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules):
    url = f"{BASE}/{prog_conference.id}/program/days"
    resp = await client.post(url, json={"date": "2026-06-01", "name": "Day 1", "sort_order": 0}, headers=prog_headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["date"] == "2026-06-01"
    assert body["name"] == "Day 1"
    assert body["sort_order"] == 0
    assert "id" in body


@pytest.mark.asyncio
async def test_create_day_duplicate_date_fails(
    client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules, prog_day: ProgramDay
):
    url = f"{BASE}/{prog_conference.id}/program/days"
    resp = await client.post(url, json={"date": "2026-06-01", "name": "Dup", "sort_order": 1}, headers=prog_headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_days_with_data(
    client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules, prog_day: ProgramDay
):
    url = f"{BASE}/{prog_conference.id}/program/days"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    assert any(d["name"] == "Day 1" for d in body["items"])


@pytest.mark.asyncio
async def test_update_day(
    client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules, prog_day: ProgramDay
):
    url = f"{BASE}/{prog_conference.id}/program/days/{prog_day.id}"
    resp = await client.put(url, json={"name": "Updated Day 1", "sort_order": 5}, headers=prog_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Updated Day 1"
    assert body["sort_order"] == 5


@pytest.mark.asyncio
async def test_update_day_change_date(
    client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules, prog_day: ProgramDay
):
    url = f"{BASE}/{prog_conference.id}/program/days/{prog_day.id}"
    resp = await client.put(url, json={"date": "2026-06-10"}, headers=prog_headers)
    assert resp.status_code == 200
    assert resp.json()["date"] == "2026-06-10"


@pytest.mark.asyncio
async def test_delete_day(
    client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules, prog_day: ProgramDay
):
    url = f"{BASE}/{prog_conference.id}/program/days/{prog_day.id}"
    resp = await client.delete(url, headers=prog_headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_generate_days(client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules):
    url = f"{BASE}/{prog_conference.id}/program/days/generate"
    resp = await client.post(
        url,
        json={"include_pre_conference": False, "include_post_conference": False},
        headers=prog_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    # Conference is Jun 1-3 => 3 days
    assert len(body["created"]) == 3
    assert body["skipped"] == 0


@pytest.mark.asyncio
async def test_generate_days_with_pre_post(
    client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules
):
    url = f"{BASE}/{prog_conference.id}/program/days/generate"
    resp = await client.post(
        url,
        json={"include_pre_conference": True, "include_post_conference": True},
        headers=prog_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    # May 31 through Jun 4 => 5 days
    assert len(body["created"]) == 5


@pytest.mark.asyncio
async def test_generate_days_skips_existing(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_day: ProgramDay,
):
    url = f"{BASE}/{prog_conference.id}/program/days/generate"
    resp = await client.post(
        url,
        json={"include_pre_conference": False, "include_post_conference": False},
        headers=prog_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    # Jun 1 already exists, Jun 2 and Jun 3 created
    assert len(body["created"]) == 2
    assert body["skipped"] == 1


# ═══════════════════════════════════════════════════════════════════════════
# PROGRAM TIME SLOTS
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_list_slots_empty(
    client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules, prog_day: ProgramDay
):
    url = f"{BASE}/{prog_conference.id}/program/days/{prog_day.id}/slots"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_create_slot(
    client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules, prog_day: ProgramDay
):
    url = f"{BASE}/{prog_conference.id}/program/days/{prog_day.id}/slots"
    resp = await client.post(
        url,
        json={"start_time": "09:00:00", "end_time": "09:30:00", "sort_order": 0},
        headers=prog_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["start_time"] == "09:00:00"
    assert body["end_time"] == "09:30:00"
    assert body["is_session_free"] is False


@pytest.mark.asyncio
async def test_create_slot_session_free(
    client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules, prog_day: ProgramDay
):
    url = f"{BASE}/{prog_conference.id}/program/days/{prog_day.id}/slots"
    resp = await client.post(
        url,
        json={"start_time": "12:00:00", "end_time": "13:00:00", "sort_order": 5, "is_session_free": True},
        headers=prog_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["is_session_free"] is True


@pytest.mark.asyncio
async def test_list_slots_with_data(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_day: ProgramDay,
    prog_slot: ProgramTimeSlot,
):
    url = f"{BASE}/{prog_conference.id}/program/days/{prog_day.id}/slots"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_create_slots_batch(
    client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules, prog_day: ProgramDay
):
    url = f"{BASE}/{prog_conference.id}/program/days/{prog_day.id}/slots/batch"
    resp = await client.post(
        url,
        json={"start_time": "09:00:00", "end_time": "12:00:00", "interval_minutes": 30},
        headers=prog_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    # 3 hours / 30min = 6 slots
    assert body["total"] == 6
    assert len(body["items"]) == 6


@pytest.mark.asyncio
async def test_create_slots_batch_skips_existing(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_day: ProgramDay,
    prog_slot: ProgramTimeSlot,
):
    url = f"{BASE}/{prog_conference.id}/program/days/{prog_day.id}/slots/batch"
    resp = await client.post(
        url,
        json={"start_time": "09:00:00", "end_time": "10:00:00", "interval_minutes": 30},
        headers=prog_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    # 09:00 exists, only 09:30 created
    assert body["total"] == 1


@pytest.mark.asyncio
async def test_update_slot(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_slot: ProgramTimeSlot,
):
    url = f"{BASE}/{prog_conference.id}/program/slots/{prog_slot.id}"
    resp = await client.put(
        url,
        json={"start_time": "10:00:00", "end_time": "10:45:00", "sort_order": 3, "is_session_free": True},
        headers=prog_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["start_time"] == "10:00:00"
    assert body["end_time"] == "10:45:00"
    assert body["sort_order"] == 3
    assert body["is_session_free"] is True


@pytest.mark.asyncio
async def test_delete_slot(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_day: ProgramDay,
):
    # Create a slot to delete (no sessions attached)
    create_url = f"{BASE}/{prog_conference.id}/program/days/{prog_day.id}/slots"
    create_resp = await client.post(
        create_url,
        json={"start_time": "16:00:00", "end_time": "16:30:00", "sort_order": 99},
        headers=prog_headers,
    )
    assert create_resp.status_code == 201
    slot_id = create_resp.json()["id"]

    url = f"{BASE}/{prog_conference.id}/program/slots/{slot_id}"
    resp = await client.delete(url, headers=prog_headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_slot_with_sessions_fails(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_slot: ProgramTimeSlot,
    prog_session: ProgramSession,
):
    url = f"{BASE}/{prog_conference.id}/program/slots/{prog_slot.id}"
    resp = await client.delete(url, headers=prog_headers)
    assert resp.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════
# PROGRAM TRACKS
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_list_tracks_empty(client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules):
    url = f"{BASE}/{prog_conference.id}/program/tracks"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_create_track(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_day: ProgramDay,
):
    url = f"{BASE}/{prog_conference.id}/program/tracks"
    resp = await client.post(
        url,
        json={
            "program_day_id": str(prog_day.id),
            "name": "Track A",
            "color": "#FF0000",
            "sort_order": 0,
        },
        headers=prog_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Track A"
    assert body["color"] == "#FF0000"
    assert body["is_active"] is True


@pytest.mark.asyncio
async def test_create_track_with_location(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_day: ProgramDay,
    prog_location: Location,
):
    url = f"{BASE}/{prog_conference.id}/program/tracks"
    resp = await client.post(
        url,
        json={
            "program_day_id": str(prog_day.id),
            "name": "Room Track",
            "location_id": str(prog_location.id),
            "sort_order": 1,
        },
        headers=prog_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["location_id"] == str(prog_location.id)
    assert body["location_name"] == "Main Hall"


@pytest.mark.asyncio
async def test_list_tracks_with_data(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_track: ProgramTrack,
):
    url = f"{BASE}/{prog_conference.id}/program/tracks"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_list_tracks_filter_by_day(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_track: ProgramTrack,
    prog_day: ProgramDay,
):
    url = f"{BASE}/{prog_conference.id}/program/tracks?day_id={prog_day.id}"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_list_tracks_filter_is_active(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_track: ProgramTrack,
):
    url = f"{BASE}/{prog_conference.id}/program/tracks?is_active=true"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_update_track(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_track: ProgramTrack,
):
    url = f"{BASE}/{prog_conference.id}/program/tracks/{prog_track.id}"
    resp = await client.put(
        url,
        json={"name": "Renamed Track", "color": "#00FF00", "sort_order": 10, "is_active": False},
        headers=prog_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Renamed Track"
    assert body["color"] == "#00FF00"
    assert body["sort_order"] == 10
    assert body["is_active"] is False


@pytest.mark.asyncio
async def test_update_track_with_location(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_track: ProgramTrack,
    prog_location: Location,
):
    url = f"{BASE}/{prog_conference.id}/program/tracks/{prog_track.id}"
    resp = await client.put(
        url,
        json={"location_id": str(prog_location.id)},
        headers=prog_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["location_id"] == str(prog_location.id)
    assert body["location_name"] == "Main Hall"


@pytest.mark.asyncio
async def test_reorder_tracks(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_day: ProgramDay,
):
    # Create two tracks
    base_url = f"{BASE}/{prog_conference.id}/program/tracks"
    resp1 = await client.post(
        base_url,
        json={"program_day_id": str(prog_day.id), "name": "First", "sort_order": 0},
        headers=prog_headers,
    )
    resp2 = await client.post(
        base_url,
        json={"program_day_id": str(prog_day.id), "name": "Second", "sort_order": 1},
        headers=prog_headers,
    )
    t1_id = resp1.json()["id"]
    t2_id = resp2.json()["id"]

    # Reorder: second before first
    url = f"{BASE}/{prog_conference.id}/program/tracks/reorder"
    resp = await client.put(
        url,
        json={"track_ids": [t2_id, t1_id]},
        headers=prog_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 2


@pytest.mark.asyncio
async def test_delete_track(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_track: ProgramTrack,
):
    url = f"{BASE}/{prog_conference.id}/program/tracks/{prog_track.id}"
    resp = await client.delete(url, headers=prog_headers)
    assert resp.status_code == 204


# ═══════════════════════════════════════════════════════════════════════════
# PROGRAM SESSIONS
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_list_sessions_empty(client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules):
    url = f"{BASE}/{prog_conference.id}/program/sessions"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_create_session_minimal(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_slot: ProgramTimeSlot,
):
    url = f"{BASE}/{prog_conference.id}/program/sessions"
    resp = await client.post(
        url,
        json={
            "start_slot_id": str(prog_slot.id),
            "title": "Simple Session",
        },
        headers=prog_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Simple Session"
    assert body["slot_span"] == 1
    assert body["track_span"] == 1
    assert body["is_general_event"] is False


@pytest.mark.asyncio
async def test_create_session_with_track_and_type(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_slot: ProgramTimeSlot,
    prog_track: ProgramTrack,
    prog_session_type: SessionType,
):
    url = f"{BASE}/{prog_conference.id}/program/sessions"
    resp = await client.post(
        url,
        json={
            "start_slot_id": str(prog_slot.id),
            "start_track_id": str(prog_track.id),
            "title": "Typed Session",
            "session_type_id": str(prog_session_type.id),
            "slot_span": 2,
            "track_span": 1,
            "description": "A detailed session",
            "is_general_event": False,
            "color": "#ABCDEF",
            "notes": "Some notes",
            "allow_in_session_free": True,
            "settings": {"key": "value"},
        },
        headers=prog_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Typed Session"
    assert body["session_type_name"] == "Talk"
    assert body["separately_bookable"] is True
    assert body["slot_span"] == 2
    assert body["color"] == "#ABCDEF"
    assert body["notes"] == "Some notes"
    assert body["allow_in_session_free"] is True
    assert body["settings"]["key"] == "value"


@pytest.mark.asyncio
async def test_create_session_general_event(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_slot: ProgramTimeSlot,
):
    url = f"{BASE}/{prog_conference.id}/program/sessions"
    resp = await client.post(
        url,
        json={
            "start_slot_id": str(prog_slot.id),
            "title": "Lunch Break",
            "is_general_event": True,
            "track_span": 0,
        },
        headers=prog_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["is_general_event"] is True
    assert body["track_span"] == 0


@pytest.mark.asyncio
async def test_list_sessions_with_data(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_session: ProgramSession,
):
    url = f"{BASE}/{prog_conference.id}/program/sessions"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    assert any(s["title"] == "Opening Keynote" for s in body["items"])


@pytest.mark.asyncio
async def test_list_sessions_filter_by_day(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_session: ProgramSession,
    prog_day: ProgramDay,
):
    url = f"{BASE}/{prog_conference.id}/program/sessions?day_id={prog_day.id}"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_list_sessions_filter_general_event(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_session: ProgramSession,
):
    url = f"{BASE}/{prog_conference.id}/program/sessions?is_general_event=false"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_update_session(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_session: ProgramSession,
    prog_slot: ProgramTimeSlot,
):
    url = f"{BASE}/{prog_conference.id}/program/sessions/{prog_session.id}"
    resp = await client.put(
        url,
        json={
            "title": "Updated Keynote",
            "description": "New desc",
            "slot_span": 2,
            "track_span": 3,
            "is_general_event": True,
            "color": "#112233",
            "notes": "Updated notes",
            "allow_in_session_free": True,
            "settings": {"updated": True},
        },
        headers=prog_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Updated Keynote"
    assert body["description"] == "New desc"
    assert body["slot_span"] == 2
    assert body["track_span"] == 3
    assert body["is_general_event"] is True
    assert body["color"] == "#112233"


@pytest.mark.asyncio
async def test_update_session_change_slot_and_track(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_session: ProgramSession,
    prog_slot2: ProgramTimeSlot,
    prog_day: ProgramDay,
):
    # Create another track to move to
    track_url = f"{BASE}/{prog_conference.id}/program/tracks"
    track_resp = await client.post(
        track_url,
        json={"program_day_id": str(prog_day.id), "name": "Other Track", "sort_order": 5},
        headers=prog_headers,
    )
    new_track_id = track_resp.json()["id"]

    url = f"{BASE}/{prog_conference.id}/program/sessions/{prog_session.id}"
    resp = await client.put(
        url,
        json={"start_slot_id": str(prog_slot2.id), "start_track_id": new_track_id},
        headers=prog_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["start_slot_id"] == str(prog_slot2.id)
    assert body["start_track_id"] == new_track_id


@pytest.mark.asyncio
async def test_update_session_change_session_type(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_session: ProgramSession,
    prog_session_type: SessionType,
):
    url = f"{BASE}/{prog_conference.id}/program/sessions/{prog_session.id}"
    resp = await client.put(
        url,
        json={"session_type_id": str(prog_session_type.id)},
        headers=prog_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["session_type_id"] == str(prog_session_type.id)
    assert body["session_type_name"] == "Talk"
    assert body["separately_bookable"] is True


@pytest.mark.asyncio
async def test_update_session_assign_paper(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_session: ProgramSession,
    prog_paper: CFPPaper,
):
    url = f"{BASE}/{prog_conference.id}/program/sessions/{prog_session.id}"
    resp = await client.put(
        url,
        json={"paper_id": str(prog_paper.id)},
        headers=prog_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["paper_id"] == str(prog_paper.id)
    # Title gets auto-populated from paper
    assert body["title"] == "My Great Paper"
    assert body["paper_title"] == "My Great Paper"
    assert body["speaker_name"] == "Alice Speaker"


@pytest.mark.asyncio
async def test_update_session_unassign_paper(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_session: ProgramSession,
    prog_paper: CFPPaper,
    prog_session_type: SessionType,
    db_session: AsyncSession,
):
    # First assign a paper and session type
    sess = await db_session.get(ProgramSession, prog_session.id)
    sess.paper_id = prog_paper.id
    sess.session_type_id = prog_session_type.id
    sess.title = prog_paper.title
    await db_session.commit()

    url = f"{BASE}/{prog_conference.id}/program/sessions/{prog_session.id}"
    resp = await client.put(
        url,
        json={"paper_id": None},
        headers=prog_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["paper_id"] is None
    # Title should revert to session type name
    assert body["title"] == "Talk"


@pytest.mark.asyncio
async def test_move_session(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_session: ProgramSession,
    prog_slot2: ProgramTimeSlot,
    prog_track: ProgramTrack,
):
    url = f"{BASE}/{prog_conference.id}/program/sessions/{prog_session.id}/move"
    resp = await client.put(
        url,
        json={
            "start_slot_id": str(prog_slot2.id),
            "start_track_id": str(prog_track.id),
        },
        headers=prog_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["start_slot_id"] == str(prog_slot2.id)
    assert body["start_track_id"] == str(prog_track.id)


@pytest.mark.asyncio
async def test_move_session_no_track(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_session: ProgramSession,
    prog_slot2: ProgramTimeSlot,
):
    url = f"{BASE}/{prog_conference.id}/program/sessions/{prog_session.id}/move"
    resp = await client.put(
        url,
        json={"start_slot_id": str(prog_slot2.id)},
        headers=prog_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["start_slot_id"] == str(prog_slot2.id)
    assert body["start_track_id"] is None


@pytest.mark.asyncio
async def test_delete_session(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_session: ProgramSession,
):
    url = f"{BASE}/{prog_conference.id}/program/sessions/{prog_session.id}"
    resp = await client.delete(url, headers=prog_headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_enriched_sessions_empty(
    client: AsyncClient, prog_conference: Conference, prog_headers: dict, prog_modules
):
    url = f"{BASE}/{prog_conference.id}/program/sessions/enriched"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["custom_fields"] == []


@pytest.mark.asyncio
async def test_enriched_sessions_with_data(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_session: ProgramSession,
    prog_day: ProgramDay,
    prog_slot: ProgramTimeSlot,
    prog_track: ProgramTrack,
):
    url = f"{BASE}/{prog_conference.id}/program/sessions/enriched"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    item = body["items"][0]
    assert item["title"] == "Opening Keynote"
    assert item["day_id"] == str(prog_day.id)
    assert item["day_name"] == "Day 1"
    assert item["day_date"] == "2026-06-01"
    assert item["start_time"] is not None
    assert item["track_name"] == "Main Track"


@pytest.mark.asyncio
async def test_enriched_sessions_with_paper(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_slot: ProgramTimeSlot,
    prog_track: ProgramTrack,
    prog_day: ProgramDay,
    prog_paper: CFPPaper,
    prog_applicant: CFPApplicant,
    prog_session_type: SessionType,
    db_session: AsyncSession,
):
    # Create a session linked to a paper
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=prog_conference.tenant_id,
        conference_id=prog_conference.id,
        start_slot_id=prog_slot.id,
        start_track_id=prog_track.id,
        title=prog_paper.title,
        paper_id=prog_paper.id,
        session_type_id=prog_session_type.id,
        slot_span=1,
        track_span=1,
    )
    db_session.add(s)
    await db_session.commit()

    url = f"{BASE}/{prog_conference.id}/program/sessions/enriched"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    body = resp.json()
    enriched = [i for i in body["items"] if i["paper_id"] == str(prog_paper.id)]
    assert len(enriched) == 1
    item = enriched[0]
    assert item["paper_title"] == "My Great Paper"
    assert item["speaker_name"] == "Alice Speaker"
    assert item["session_type_name"] == "Talk"


# ═══════════════════════════════════════════════════════════════════════════
# PROGRAM PUBLISH
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_publish_preview_initial(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_slot: ProgramTimeSlot,
    prog_track: ProgramTrack,
    prog_paper: CFPPaper,
    prog_paper2: CFPPaper,
    prog_applicant: CFPApplicant,
    db_session: AsyncSession,
):
    # Put paper1 in a session (accepted), paper2 not in session (rejected)
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=prog_conference.tenant_id,
        conference_id=prog_conference.id,
        start_slot_id=prog_slot.id,
        start_track_id=prog_track.id,
        title=prog_paper.title,
        paper_id=prog_paper.id,
        slot_span=1,
        track_span=1,
    )
    db_session.add(s)
    await db_session.commit()

    url = f"{BASE}/{prog_conference.id}/program/publish/preview"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["already_published"] is False
    assert body["papers_to_accept"] == 1
    assert body["papers_to_reject"] == 1
    assert body["speakers_to_notify"] >= 1
    assert len(body["accepted_papers"]) == 1
    assert len(body["rejected_papers"]) == 1


@pytest.mark.asyncio
async def test_publish_program(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_slot: ProgramTimeSlot,
    prog_track: ProgramTrack,
    prog_paper: CFPPaper,
    prog_paper2: CFPPaper,
    prog_applicant: CFPApplicant,
    db_session: AsyncSession,
):
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=prog_conference.tenant_id,
        conference_id=prog_conference.id,
        start_slot_id=prog_slot.id,
        start_track_id=prog_track.id,
        title=prog_paper.title,
        paper_id=prog_paper.id,
        slot_span=1,
        track_span=1,
    )
    db_session.add(s)
    await db_session.commit()

    url = f"{BASE}/{prog_conference.id}/program/publish"
    resp = await client.post(url, headers=prog_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["papers_accepted"] == 1
    assert body["papers_rejected"] == 1
    assert body["notifications_sent"] >= 1
    assert "published_at" in body


@pytest.mark.asyncio
async def test_publish_preview_update_mode(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_slot: ProgramTimeSlot,
    prog_slot2: ProgramTimeSlot,
    prog_track: ProgramTrack,
    prog_paper: CFPPaper,
    prog_paper2: CFPPaper,
    prog_applicant: CFPApplicant,
    db_session: AsyncSession,
):
    # Mark conference as already published and paper1 as accepted
    conf = await db_session.get(Conference, prog_conference.id)
    conf.program_published_at = datetime.now(UTC)
    prog_paper_obj = await db_session.get(CFPPaper, prog_paper.id)
    prog_paper_obj.status = PaperStatus.ACCEPTED.value
    prog_paper2_obj = await db_session.get(CFPPaper, prog_paper2.id)
    prog_paper2_obj.status = PaperStatus.REJECTED.value

    # Paper1 stays in session, paper2 stays out - no changes
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=prog_conference.tenant_id,
        conference_id=prog_conference.id,
        start_slot_id=prog_slot.id,
        start_track_id=prog_track.id,
        title=prog_paper.title,
        paper_id=prog_paper.id,
        slot_span=1,
        track_span=1,
    )
    db_session.add(s)
    await db_session.commit()

    url = f"{BASE}/{prog_conference.id}/program/publish/preview"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["already_published"] is True
    # No changes because paper1 is already ACCEPTED and paper2 is already REJECTED
    assert body["papers_to_accept"] == 0
    assert body["papers_to_reject"] == 0
    assert body["speakers_to_notify"] == 0


@pytest.mark.asyncio
async def test_update_program(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_slot: ProgramTimeSlot,
    prog_slot2: ProgramTimeSlot,
    prog_track: ProgramTrack,
    prog_paper: CFPPaper,
    prog_paper2: CFPPaper,
    prog_applicant: CFPApplicant,
    db_session: AsyncSession,
):
    # First publish
    conf = await db_session.get(Conference, prog_conference.id)
    conf.program_published_at = datetime.now(UTC)
    paper1 = await db_session.get(CFPPaper, prog_paper.id)
    paper1.status = PaperStatus.REJECTED.value
    paper2 = await db_session.get(CFPPaper, prog_paper2.id)
    paper2.status = PaperStatus.REJECTED.value

    # Now add paper1 to session (newly accepted)
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=prog_conference.tenant_id,
        conference_id=prog_conference.id,
        start_slot_id=prog_slot.id,
        start_track_id=prog_track.id,
        title=prog_paper.title,
        paper_id=prog_paper.id,
        slot_span=1,
        track_span=1,
    )
    db_session.add(s)
    await db_session.commit()

    url = f"{BASE}/{prog_conference.id}/program/update"
    resp = await client.post(url, headers=prog_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["papers_accepted"] == 1
    assert body["papers_rejected"] == 1
    assert body["notifications_sent"] >= 1
    assert "published_at" in body


@pytest.mark.asyncio
async def test_update_program_no_changes(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_slot: ProgramTimeSlot,
    prog_track: ProgramTrack,
    prog_paper: CFPPaper,
    prog_paper2: CFPPaper,
    prog_applicant: CFPApplicant,
    db_session: AsyncSession,
):
    # Already published, statuses match sessions
    conf = await db_session.get(Conference, prog_conference.id)
    conf.program_published_at = datetime.now(UTC)
    paper1 = await db_session.get(CFPPaper, prog_paper.id)
    paper1.status = PaperStatus.ACCEPTED.value
    paper2 = await db_session.get(CFPPaper, prog_paper2.id)
    paper2.status = PaperStatus.REJECTED.value

    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=prog_conference.tenant_id,
        conference_id=prog_conference.id,
        start_slot_id=prog_slot.id,
        start_track_id=prog_track.id,
        title=prog_paper.title,
        paper_id=prog_paper.id,
        slot_span=1,
        track_span=1,
    )
    db_session.add(s)
    await db_session.commit()

    url = f"{BASE}/{prog_conference.id}/program/update"
    resp = await client.post(url, headers=prog_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["notifications_sent"] == 0


@pytest.mark.asyncio
async def test_update_program_not_published_fails(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_paper: CFPPaper,
    prog_applicant: CFPApplicant,
):
    url = f"{BASE}/{prog_conference.id}/program/update"
    resp = await client.post(url, headers=prog_headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_export_sessions(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_session: ProgramSession,
    prog_day: ProgramDay,
    prog_slot: ProgramTimeSlot,
    prog_track: ProgramTrack,
):
    url = f"{BASE}/{prog_conference.id}/program/sessions/export"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "Content-Disposition" in resp.headers
    # Check CSV content
    content = resp.content.decode("utf-8-sig")
    assert "Session Title" in content
    assert "Opening Keynote" in content


@pytest.mark.asyncio
async def test_export_sessions_with_paper(
    client: AsyncClient,
    prog_conference: Conference,
    prog_headers: dict,
    prog_modules,
    prog_slot: ProgramTimeSlot,
    prog_track: ProgramTrack,
    prog_day: ProgramDay,
    prog_paper: CFPPaper,
    prog_applicant: CFPApplicant,
    prog_session_type: SessionType,
    db_session: AsyncSession,
):
    s = ProgramSession(
        id=uuid.uuid4(),
        tenant_id=prog_conference.tenant_id,
        conference_id=prog_conference.id,
        start_slot_id=prog_slot.id,
        start_track_id=prog_track.id,
        title=prog_paper.title,
        paper_id=prog_paper.id,
        session_type_id=prog_session_type.id,
        slot_span=1,
        track_span=1,
    )
    db_session.add(s)
    await db_session.commit()

    url = f"{BASE}/{prog_conference.id}/program/sessions/export"
    resp = await client.get(url, headers=prog_headers)
    assert resp.status_code == 200
    content = resp.content.decode("utf-8-sig")
    assert "My Great Paper" in content
    assert "Alice" in content
    assert "Talk" in content
