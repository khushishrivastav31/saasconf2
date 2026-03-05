"""Integration tests for program design endpoints.

Tests CRUD for days, time slots, tracks, sessions, and the grid endpoint.
Focuses on verifying the fields we recently fixed:
- allow_in_session_free on sessions
- is_session_free on time slots
- settings (including visible_cells) on sessions
"""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.associations import ConferenceCFP
from app.models.cfp import CallForPapers, CFPApplicant, CFPPaper
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers

# ── Fixtures ───────────────────────────────────────────────────────────


@pytest.fixture()
def program_module_token(tenant_admin_user: User) -> str:
    """Return a token that includes the 'program' module."""
    return create_access_token(
        user_id=tenant_admin_user.id,
        tenant_id=tenant_admin_user.tenant_id,
        role=tenant_admin_user.role,
        modules=["conferences", "program"],
    )


@pytest_asyncio.fixture()
async def program_module(db_session: AsyncSession, tenant: Tenant) -> Module:
    """Seed the 'program' module and associate it with the tenant."""
    m = Module(
        id=uuid.uuid4(),
        name="Program",
        code="program",
        description="Program design",
        is_active=True,
    )
    db_session.add(m)
    await db_session.flush()

    tm = TenantModule(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        module_id=m.id,
        is_enabled=True,
    )
    db_session.add(tm)

    # Also need conferences module for the conference fixture
    conf_mod = Module(
        id=uuid.uuid4(),
        name="Conferences",
        code="conferences",
        description="Conference management",
        is_active=True,
    )
    db_session.add(conf_mod)
    await db_session.flush()

    tm2 = TenantModule(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        module_id=conf_mod.id,
        is_enabled=True,
    )
    db_session.add(tm2)
    await db_session.commit()
    return m


# ── URL helpers ────────────────────────────────────────────────────────


def _days_url(conference_id: uuid.UUID) -> str:
    return f"/api/v1/conferences/{conference_id}/program/days"


def _slots_url(conference_id: uuid.UUID, day_id: uuid.UUID) -> str:
    return f"/api/v1/conferences/{conference_id}/program/days/{day_id}/slots"


def _slot_url(conference_id: uuid.UUID, slot_id: uuid.UUID) -> str:
    return f"/api/v1/conferences/{conference_id}/program/slots/{slot_id}"


def _tracks_url(conference_id: uuid.UUID) -> str:
    return f"/api/v1/conferences/{conference_id}/program/tracks"


def _track_url(conference_id: uuid.UUID, track_id: uuid.UUID) -> str:
    return f"/api/v1/conferences/{conference_id}/program/tracks/{track_id}"


def _sessions_url(conference_id: uuid.UUID) -> str:
    return f"/api/v1/conferences/{conference_id}/program/sessions"


def _session_url(conference_id: uuid.UUID, session_id: uuid.UUID) -> str:
    return f"/api/v1/conferences/{conference_id}/program/sessions/{session_id}"


def _grid_url(conference_id: uuid.UUID, day_id: uuid.UUID) -> str:
    return f"/api/v1/conferences/{conference_id}/program/grid/{day_id}"


# ── Helper to create a day + slot + track quickly ──────────────────────


async def _seed_day(client: AsyncClient, conference_id: uuid.UUID, token: str, date: str = "2026-06-01") -> dict:
    resp = await client.post(
        _days_url(conference_id),
        json={"date": date, "name": "Day 1"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _seed_slot(
    client: AsyncClient,
    conference_id: uuid.UUID,
    day_id: uuid.UUID,
    token: str,
    start: str = "09:00:00",
    end: str = "09:30:00",
    is_session_free: bool = False,
) -> dict:
    resp = await client.post(
        _slots_url(conference_id, day_id),
        json={"start_time": start, "end_time": end, "is_session_free": is_session_free},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _seed_track(
    client: AsyncClient,
    conference_id: uuid.UUID,
    token: str,
    name: str = "Track 1",
    day_id: uuid.UUID | None = None,
) -> dict:
    payload: dict = {"name": name, "sort_order": 0}
    if day_id:
        payload["program_day_id"] = str(day_id)
    resp = await client.post(
        _tracks_url(conference_id),
        json=payload,
        headers=auth_headers(token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Day Tests ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_and_list_days(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Create a program day and verify it appears in the list."""
    day = await _seed_day(client, conference.id, program_module_token)
    assert day["date"] == "2026-06-01"
    assert day["name"] == "Day 1"
    assert day["conference_id"] == str(conference.id)

    # List
    resp = await client.get(
        _days_url(conference.id),
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert any(d["id"] == day["id"] for d in data["items"])


@pytest.mark.asyncio
async def test_update_day(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Update a program day's name."""
    day = await _seed_day(client, conference.id, program_module_token)
    resp = await client.put(
        f"{_days_url(conference.id)}/{day['id']}",
        json={"name": "Updated Day"},
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Day"


@pytest.mark.asyncio
async def test_delete_day(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Delete a program day."""
    day = await _seed_day(client, conference.id, program_module_token)
    resp = await client.delete(
        f"{_days_url(conference.id)}/{day['id']}",
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 204


# ── Time Slot Tests ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_slot_with_is_session_free(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Create a slot with is_session_free=True and verify it is returned."""
    day = await _seed_day(client, conference.id, program_module_token)
    slot = await _seed_slot(
        client,
        conference.id,
        uuid.UUID(day["id"]),
        program_module_token,
        start="12:00:00",
        end="13:00:00",
        is_session_free=True,
    )
    assert slot["is_session_free"] is True


@pytest.mark.asyncio
async def test_create_slot_default_is_session_free_false(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Create a normal slot and verify is_session_free defaults to False."""
    day = await _seed_day(client, conference.id, program_module_token)
    slot = await _seed_slot(
        client,
        conference.id,
        uuid.UUID(day["id"]),
        program_module_token,
    )
    assert slot["is_session_free"] is False


@pytest.mark.asyncio
async def test_update_slot_is_session_free(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Toggle is_session_free via update."""
    day = await _seed_day(client, conference.id, program_module_token)
    slot = await _seed_slot(
        client,
        conference.id,
        uuid.UUID(day["id"]),
        program_module_token,
    )
    assert slot["is_session_free"] is False

    # Update to True
    resp = await client.put(
        _slot_url(conference.id, uuid.UUID(slot["id"])),
        json={"is_session_free": True},
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_session_free"] is True

    # Update back to False
    resp = await client.put(
        _slot_url(conference.id, uuid.UUID(slot["id"])),
        json={"is_session_free": False},
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 200
    assert resp.json()["is_session_free"] is False


@pytest.mark.asyncio
async def test_delete_slot(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Delete a time slot."""
    day = await _seed_day(client, conference.id, program_module_token)
    slot = await _seed_slot(
        client,
        conference.id,
        uuid.UUID(day["id"]),
        program_module_token,
    )
    resp = await client.delete(
        _slot_url(conference.id, uuid.UUID(slot["id"])),
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 204


# ── Track Tests ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_and_list_tracks(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Create a track and list it."""
    day = await _seed_day(client, conference.id, program_module_token)
    track = await _seed_track(
        client,
        conference.id,
        program_module_token,
        name="Main Hall",
        day_id=uuid.UUID(day["id"]),
    )
    assert track["name"] == "Main Hall"

    resp = await client.get(
        _tracks_url(conference.id),
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_update_track(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Update a track's name."""
    day = await _seed_day(client, conference.id, program_module_token)
    track = await _seed_track(
        client,
        conference.id,
        program_module_token,
        day_id=uuid.UUID(day["id"]),
    )
    resp = await client.put(
        _track_url(conference.id, uuid.UUID(track["id"])),
        json={"name": "Renamed Track"},
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed Track"


@pytest.mark.asyncio
async def test_delete_track(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Delete a track."""
    day = await _seed_day(client, conference.id, program_module_token)
    track = await _seed_track(
        client,
        conference.id,
        program_module_token,
        day_id=uuid.UUID(day["id"]),
    )
    resp = await client.delete(
        _track_url(conference.id, uuid.UUID(track["id"])),
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 204


# ── Session Tests ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_session_basic(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Create a basic session and verify the response."""
    day = await _seed_day(client, conference.id, program_module_token)
    day_id = uuid.UUID(day["id"])
    slot = await _seed_slot(client, conference.id, day_id, program_module_token)
    track = await _seed_track(client, conference.id, program_module_token, day_id=day_id)

    resp = await client.post(
        _sessions_url(conference.id),
        json={
            "start_slot_id": slot["id"],
            "start_track_id": track["id"],
            "title": "Keynote",
            "color": "#3B82F6",
        },
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Keynote"
    assert data["slot_span"] == 1
    assert data["track_span"] == 1
    assert data["allow_in_session_free"] is False
    assert data["settings"] == {}


@pytest.mark.asyncio
async def test_create_session_with_allow_in_session_free(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Create a session with allow_in_session_free=True."""
    day = await _seed_day(client, conference.id, program_module_token)
    day_id = uuid.UUID(day["id"])
    slot = await _seed_slot(client, conference.id, day_id, program_module_token)
    track = await _seed_track(client, conference.id, program_module_token, day_id=day_id)

    resp = await client.post(
        _sessions_url(conference.id),
        json={
            "start_slot_id": slot["id"],
            "start_track_id": track["id"],
            "title": "Workshop (spans break)",
            "allow_in_session_free": True,
            "color": "#10B981",
        },
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["allow_in_session_free"] is True


@pytest.mark.asyncio
async def test_create_session_with_settings_visible_cells(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Create a session with visible_cells in settings."""
    day = await _seed_day(client, conference.id, program_module_token)
    day_id = uuid.UUID(day["id"])
    slot1 = await _seed_slot(client, conference.id, day_id, program_module_token, start="09:00:00", end="09:30:00")
    slot2 = await _seed_slot(client, conference.id, day_id, program_module_token, start="09:30:00", end="10:00:00")
    slot3 = await _seed_slot(client, conference.id, day_id, program_module_token, start="10:00:00", end="10:30:00")
    track1 = await _seed_track(client, conference.id, program_module_token, name="Track A", day_id=day_id)
    track2 = await _seed_track(client, conference.id, program_module_token, name="Track B", day_id=day_id)

    visible_cells = [
        {"slot_id": slot1["id"], "track_id": track1["id"]},
        {"slot_id": slot2["id"], "track_id": track2["id"]},
        {"slot_id": slot3["id"], "track_id": track1["id"]},
    ]

    resp = await client.post(
        _sessions_url(conference.id),
        json={
            "start_slot_id": slot1["id"],
            "start_track_id": track1["id"],
            "slot_span": 3,
            "track_span": 2,
            "title": "Diagonal Session",
            "color": "#8B5CF6",
            "settings": {"visible_cells": visible_cells},
        },
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["settings"]["visible_cells"] == visible_cells
    assert data["slot_span"] == 3
    assert data["track_span"] == 2


@pytest.mark.asyncio
async def test_update_session_allow_in_session_free(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Update allow_in_session_free on an existing session."""
    day = await _seed_day(client, conference.id, program_module_token)
    day_id = uuid.UUID(day["id"])
    slot = await _seed_slot(client, conference.id, day_id, program_module_token)
    track = await _seed_track(client, conference.id, program_module_token, day_id=day_id)

    # Create without allow_in_session_free
    create_resp = await client.post(
        _sessions_url(conference.id),
        json={
            "start_slot_id": slot["id"],
            "start_track_id": track["id"],
            "title": "Session",
            "color": "#EF4444",
        },
        headers=auth_headers(program_module_token),
    )
    assert create_resp.status_code == 201
    session_id = create_resp.json()["id"]
    assert create_resp.json()["allow_in_session_free"] is False

    # Update to True
    update_resp = await client.put(
        _session_url(conference.id, uuid.UUID(session_id)),
        json={"allow_in_session_free": True},
        headers=auth_headers(program_module_token),
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["allow_in_session_free"] is True

    # Update back to False
    update_resp2 = await client.put(
        _session_url(conference.id, uuid.UUID(session_id)),
        json={"allow_in_session_free": False},
        headers=auth_headers(program_module_token),
    )
    assert update_resp2.status_code == 200
    assert update_resp2.json()["allow_in_session_free"] is False


@pytest.mark.asyncio
async def test_update_session_settings(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Update settings on an existing session."""
    day = await _seed_day(client, conference.id, program_module_token)
    day_id = uuid.UUID(day["id"])
    slot = await _seed_slot(client, conference.id, day_id, program_module_token)
    track = await _seed_track(client, conference.id, program_module_token, day_id=day_id)

    create_resp = await client.post(
        _sessions_url(conference.id),
        json={
            "start_slot_id": slot["id"],
            "start_track_id": track["id"],
            "title": "Session",
            "color": "#F59E0B",
        },
        headers=auth_headers(program_module_token),
    )
    assert create_resp.status_code == 201
    session_id = create_resp.json()["id"]
    assert create_resp.json()["settings"] == {}

    # Update settings with visible_cells
    visible_cells = [{"slot_id": slot["id"], "track_id": track["id"]}]
    update_resp = await client.put(
        _session_url(conference.id, uuid.UUID(session_id)),
        json={"settings": {"visible_cells": visible_cells}},
        headers=auth_headers(program_module_token),
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["settings"]["visible_cells"] == visible_cells


@pytest.mark.asyncio
async def test_delete_session(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Delete a session."""
    day = await _seed_day(client, conference.id, program_module_token)
    day_id = uuid.UUID(day["id"])
    slot = await _seed_slot(client, conference.id, day_id, program_module_token)
    track = await _seed_track(client, conference.id, program_module_token, day_id=day_id)

    create_resp = await client.post(
        _sessions_url(conference.id),
        json={
            "start_slot_id": slot["id"],
            "start_track_id": track["id"],
            "title": "To Delete",
            "color": "#EF4444",
        },
        headers=auth_headers(program_module_token),
    )
    assert create_resp.status_code == 201
    session_id = create_resp.json()["id"]

    resp = await client.delete(
        _session_url(conference.id, uuid.UUID(session_id)),
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_move_session(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Move a session to a different slot/track."""
    day = await _seed_day(client, conference.id, program_module_token)
    day_id = uuid.UUID(day["id"])
    slot1 = await _seed_slot(client, conference.id, day_id, program_module_token, start="09:00:00", end="09:30:00")
    slot2 = await _seed_slot(client, conference.id, day_id, program_module_token, start="09:30:00", end="10:00:00")
    track = await _seed_track(client, conference.id, program_module_token, day_id=day_id)

    create_resp = await client.post(
        _sessions_url(conference.id),
        json={
            "start_slot_id": slot1["id"],
            "start_track_id": track["id"],
            "title": "Movable",
            "color": "#06B6D4",
        },
        headers=auth_headers(program_module_token),
    )
    assert create_resp.status_code == 201
    session_id = create_resp.json()["id"]

    resp = await client.put(
        f"{_session_url(conference.id, uuid.UUID(session_id))}/move",
        json={"start_slot_id": slot2["id"], "start_track_id": track["id"]},
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 200
    assert resp.json()["start_slot_id"] == slot2["id"]


# ── Grid Endpoint Tests ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_grid_returns_is_session_free_and_allow_in_session_free(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Grid endpoint returns is_session_free on slots and allow_in_session_free on sessions."""
    day = await _seed_day(client, conference.id, program_module_token)
    day_id = uuid.UUID(day["id"])

    # Create one regular slot and one session-free (break) slot
    slot_regular = await _seed_slot(
        client,
        conference.id,
        day_id,
        program_module_token,
        start="09:00:00",
        end="09:30:00",
        is_session_free=False,
    )
    slot_break = await _seed_slot(
        client,
        conference.id,
        day_id,
        program_module_token,
        start="10:00:00",
        end="10:30:00",
        is_session_free=True,
    )
    track = await _seed_track(client, conference.id, program_module_token, day_id=day_id)

    # Create a normal session and one with allow_in_session_free
    await client.post(
        _sessions_url(conference.id),
        json={
            "start_slot_id": slot_regular["id"],
            "start_track_id": track["id"],
            "title": "Normal",
            "color": "#3B82F6",
        },
        headers=auth_headers(program_module_token),
    )
    await client.post(
        _sessions_url(conference.id),
        json={
            "start_slot_id": slot_break["id"],
            "start_track_id": track["id"],
            "title": "Break-spanning",
            "allow_in_session_free": True,
            "color": "#10B981",
        },
        headers=auth_headers(program_module_token),
    )

    # Fetch grid
    resp = await client.get(
        _grid_url(conference.id, day_id),
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 200
    grid = resp.json()

    # Verify slots
    slots_by_id = {s["id"]: s for s in grid["slots"]}
    assert slots_by_id[slot_regular["id"]]["is_session_free"] is False
    assert slots_by_id[slot_break["id"]]["is_session_free"] is True

    # Verify sessions
    sessions_by_title = {s["title"]: s for s in grid["sessions"]}
    assert sessions_by_title["Normal"]["allow_in_session_free"] is False
    assert sessions_by_title["Break-spanning"]["allow_in_session_free"] is True


@pytest.mark.asyncio
async def test_grid_returns_settings_with_visible_cells(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Grid endpoint returns settings including visible_cells on sessions."""
    day = await _seed_day(client, conference.id, program_module_token)
    day_id = uuid.UUID(day["id"])
    slot = await _seed_slot(client, conference.id, day_id, program_module_token)
    track = await _seed_track(client, conference.id, program_module_token, day_id=day_id)

    visible_cells = [{"slot_id": slot["id"], "track_id": track["id"]}]
    await client.post(
        _sessions_url(conference.id),
        json={
            "start_slot_id": slot["id"],
            "start_track_id": track["id"],
            "title": "With Cells",
            "color": "#8B5CF6",
            "settings": {"visible_cells": visible_cells},
        },
        headers=auth_headers(program_module_token),
    )

    resp = await client.get(
        _grid_url(conference.id, day_id),
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 200
    grid = resp.json()

    session = next(s for s in grid["sessions"] if s["title"] == "With Cells")
    assert session["settings"]["visible_cells"] == visible_cells


# ── Paper Assignment Tests ────────────────────────────────────────────


async def _seed_paper(
    db_session: AsyncSession,
    tenant_id: uuid.UUID,
    conference_id: uuid.UUID,
    title: str = "Test Paper",
) -> CFPPaper:
    """Create a CFP, applicant, and paper for testing paper assignment."""
    cfp = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        title="Test CFP",
        status="open",
    )
    db_session.add(cfp)
    await db_session.flush()

    # Link CFP to conference
    assoc = ConferenceCFP(
        id=uuid.uuid4(),
        conference_id=conference_id,
        cfp_id=cfp.id,
    )
    db_session.add(assoc)

    applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        first_name="Jane",
        last_name="Speaker",
        email=f"speaker-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(applicant)
    await db_session.flush()

    paper = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        title=title,
        status="accepted",
    )
    db_session.add(paper)
    await db_session.commit()
    return paper


@pytest.mark.asyncio
async def test_assign_paper_to_session(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant: Tenant,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Assign a paper to a session via update."""
    paper = await _seed_paper(db_session, tenant.id, conference.id, "My Talk")
    day = await _seed_day(client, conference.id, program_module_token)
    day_id = uuid.UUID(day["id"])
    slot = await _seed_slot(client, conference.id, day_id, program_module_token)
    track = await _seed_track(client, conference.id, program_module_token, day_id=day_id)

    # Create session without paper
    create_resp = await client.post(
        _sessions_url(conference.id),
        json={
            "start_slot_id": slot["id"],
            "start_track_id": track["id"],
            "title": "Session",
            "color": "#3B82F6",
        },
        headers=auth_headers(program_module_token),
    )
    assert create_resp.status_code == 201
    session_id = create_resp.json()["id"]
    assert create_resp.json()["paper_id"] is None
    assert create_resp.json()["paper_title"] is None

    # Assign paper
    update_resp = await client.put(
        _session_url(conference.id, uuid.UUID(session_id)),
        json={"paper_id": str(paper.id)},
        headers=auth_headers(program_module_token),
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["paper_id"] == str(paper.id)
    assert update_resp.json()["paper_title"] == "My Talk"


@pytest.mark.asyncio
async def test_unassign_paper_from_session(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant: Tenant,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Unassign a paper by sending paper_id: null."""
    paper = await _seed_paper(db_session, tenant.id, conference.id, "Removable Talk")
    day = await _seed_day(client, conference.id, program_module_token)
    day_id = uuid.UUID(day["id"])
    slot = await _seed_slot(client, conference.id, day_id, program_module_token)
    track = await _seed_track(client, conference.id, program_module_token, day_id=day_id)

    # Create session with paper
    create_resp = await client.post(
        _sessions_url(conference.id),
        json={
            "start_slot_id": slot["id"],
            "start_track_id": track["id"],
            "title": "Session",
            "color": "#3B82F6",
            "paper_id": str(paper.id),
        },
        headers=auth_headers(program_module_token),
    )
    assert create_resp.status_code == 201
    session_id = create_resp.json()["id"]
    assert create_resp.json()["paper_id"] == str(paper.id)

    # Unassign paper by sending null
    update_resp = await client.put(
        _session_url(conference.id, uuid.UUID(session_id)),
        json={"paper_id": None},
        headers=auth_headers(program_module_token),
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["paper_id"] is None
    assert update_resp.json()["paper_title"] is None


@pytest.mark.asyncio
async def test_grid_returns_paper_title(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant: Tenant,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Grid endpoint returns paper_title for sessions with assigned papers."""
    paper = await _seed_paper(db_session, tenant.id, conference.id, "Grid Paper")
    day = await _seed_day(client, conference.id, program_module_token)
    day_id = uuid.UUID(day["id"])
    slot = await _seed_slot(client, conference.id, day_id, program_module_token)
    track = await _seed_track(client, conference.id, program_module_token, day_id=day_id)

    # Create session with paper
    await client.post(
        _sessions_url(conference.id),
        json={
            "start_slot_id": slot["id"],
            "start_track_id": track["id"],
            "title": "Paper Session",
            "color": "#8B5CF6",
            "paper_id": str(paper.id),
        },
        headers=auth_headers(program_module_token),
    )

    # Fetch grid
    resp = await client.get(
        _grid_url(conference.id, day_id),
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 200
    grid = resp.json()

    session = next(s for s in grid["sessions"] if s["title"] == "Paper Session")
    assert session["paper_id"] == str(paper.id)
    assert session["paper_title"] == "Grid Paper"


# ── Enriched Sessions Tests ───────────────────────────────────────────


def _enriched_url(conference_id: uuid.UUID) -> str:
    return f"/api/v1/conferences/{conference_id}/program/sessions/enriched"


@pytest.mark.asyncio
async def test_enriched_sessions_empty(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Enriched endpoint returns empty list when no sessions exist."""
    resp = await client.get(
        _enriched_url(conference.id),
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["custom_fields"] == []


@pytest.mark.asyncio
async def test_enriched_sessions_returns_session_fields(
    client: AsyncClient,
    conference: Conference,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Enriched endpoint returns resolved day, time, and track names."""
    day = await _seed_day(client, conference.id, program_module_token)
    day_id = uuid.UUID(day["id"])
    slot = await _seed_slot(client, conference.id, day_id, program_module_token)
    track = await _seed_track(client, conference.id, program_module_token, name="Room A", day_id=day_id)

    await client.post(
        _sessions_url(conference.id),
        json={
            "start_slot_id": slot["id"],
            "start_track_id": track["id"],
            "title": "Enriched Session",
            "color": "#10B981",
        },
        headers=auth_headers(program_module_token),
    )

    resp = await client.get(
        _enriched_url(conference.id),
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1

    item = data["items"][0]
    assert item["title"] == "Enriched Session"
    assert item["day_name"] == "Day 1"
    assert item["day_date"] == "2026-06-01"
    assert item["start_time"] == "09:00:00"
    assert item["end_time"] == "09:30:00"
    assert item["track_name"] == "Room A"
    assert item["color"] == "#10B981"
    assert item["paper_id"] is None
    assert item["speaker_name"] is None


@pytest.mark.asyncio
async def test_enriched_sessions_with_paper(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant: Tenant,
    program_module: Module,
    tenant_admin_user: User,
    program_module_token: str,
) -> None:
    """Enriched endpoint returns paper and speaker data."""
    paper = await _seed_paper(db_session, tenant.id, conference.id, "Deep Learning Talk")
    day = await _seed_day(client, conference.id, program_module_token)
    day_id = uuid.UUID(day["id"])
    slot = await _seed_slot(client, conference.id, day_id, program_module_token)
    track = await _seed_track(client, conference.id, program_module_token, day_id=day_id)

    await client.post(
        _sessions_url(conference.id),
        json={
            "start_slot_id": slot["id"],
            "start_track_id": track["id"],
            "title": "ML Session",
            "color": "#6366F1",
            "paper_id": str(paper.id),
        },
        headers=auth_headers(program_module_token),
    )

    resp = await client.get(
        _enriched_url(conference.id),
        headers=auth_headers(program_module_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1

    item = data["items"][0]
    assert item["paper_id"] == str(paper.id)
    assert item["paper_title"] == "Deep Learning Talk"
    assert item["speaker_name"] == "Jane Speaker"
    assert item["paper_status"] == "accepted"
