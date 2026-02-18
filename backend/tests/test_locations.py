"""Integration tests for the location CRUD API endpoints."""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.associations import ConferenceLocation
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.settings import TenantLocationType
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import _make_token, auth_headers


BASE_URL = "/api/v1/locations"


# ── Helpers ────────────────────────────────────────────────────────────


async def _setup_locations_module(
    db_session: AsyncSession, tenant: Tenant
) -> None:
    """Create the 'locations' module and enable it for the tenant."""
    mod = Module(
        id=uuid.uuid4(),
        name="Locations",
        code="locations",
        description="Location management",
        is_active=True,
    )
    db_session.add(mod)
    await db_session.flush()
    tm = TenantModule(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        module_id=mod.id,
        is_enabled=True,
    )
    db_session.add(tm)
    await db_session.commit()


async def _setup_location_type(
    db_session: AsyncSession, tenant: Tenant, conference: Conference
) -> TenantLocationType:
    """Create a valid 'venue' location type for the tenant."""
    lt = TenantLocationType(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Venue",
        slug="venue",
        is_active=True,
    )
    db_session.add(lt)
    await db_session.commit()
    return lt


def _location_payload(conference_id: uuid.UUID) -> dict:
    """Return a minimal valid location create payload."""
    return {
        "name": "Main Hall",
        "code": "MH-01",
        "location_type": "venue",
        "description": "The primary event hall",
        "capacity": 500,
        "city": "Berlin",
        "country": "Germany",
        "conference_id": str(conference_id),
    }


# ── List locations ─────────────────────────────────────────────────────


async def test_list_locations_empty(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    tenant_admin_user: User,
) -> None:
    """Listing locations returns an empty list when none exist."""
    await _setup_locations_module(db_session, tenant)
    token = _make_token(tenant_admin_user, modules=["locations"])

    response = await client.get(
        BASE_URL,
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1


# ── Create location ───────────────────────────────────────────────────


async def test_create_location_success(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    tenant_admin_user: User,
) -> None:
    """Tenant admin can create a location and receives 201."""
    await _setup_locations_module(db_session, tenant)
    await _setup_location_type(db_session, tenant, conference)
    token = _make_token(tenant_admin_user, modules=["locations"])

    payload = _location_payload(conference.id)
    response = await client.post(
        BASE_URL,
        json=payload,
        headers=auth_headers(token),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == payload["name"]
    assert data["code"] == payload["code"]
    assert data["location_type"] == "venue"
    assert data["capacity"] == 500
    assert data["city"] == "Berlin"
    assert data["country"] == "Germany"
    assert data["is_active"] is True
    assert "id" in data
    assert "tenant_id" in data
    assert str(conference.id) in data["conference_ids"]


# ── Get location by ID ────────────────────────────────────────────────


async def test_get_location_by_id(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    tenant_admin_user: User,
) -> None:
    """Get a location by ID returns the correct location."""
    await _setup_locations_module(db_session, tenant)
    await _setup_location_type(db_session, tenant, conference)
    token = _make_token(tenant_admin_user, modules=["locations"])

    # Create the location first
    payload = _location_payload(conference.id)
    create_resp = await client.post(
        BASE_URL, json=payload, headers=auth_headers(token)
    )
    assert create_resp.status_code == 201
    location_id = create_resp.json()["id"]

    # Fetch by ID
    response = await client.get(
        f"{BASE_URL}/{location_id}",
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == location_id
    assert data["name"] == payload["name"]
    assert data["tenant_id"] == str(tenant.id)


# ── Update location ───────────────────────────────────────────────────


async def test_update_location(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    tenant_admin_user: User,
) -> None:
    """Tenant admin can update a location's name and capacity."""
    await _setup_locations_module(db_session, tenant)
    await _setup_location_type(db_session, tenant, conference)
    token = _make_token(tenant_admin_user, modules=["locations"])

    # Create
    payload = _location_payload(conference.id)
    create_resp = await client.post(
        BASE_URL, json=payload, headers=auth_headers(token)
    )
    assert create_resp.status_code == 201
    location_id = create_resp.json()["id"]

    # Update
    response = await client.put(
        f"{BASE_URL}/{location_id}",
        json={"name": "Updated Hall", "capacity": 1000},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Hall"
    assert data["capacity"] == 1000
    # Original code should remain
    assert data["code"] == payload["code"]


# ── Delete location ───────────────────────────────────────────────────


async def test_delete_location(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    tenant_admin_user: User,
) -> None:
    """Tenant admin can delete a location."""
    await _setup_locations_module(db_session, tenant)
    await _setup_location_type(db_session, tenant, conference)
    token = _make_token(tenant_admin_user, modules=["locations"])

    # Create
    payload = _location_payload(conference.id)
    create_resp = await client.post(
        BASE_URL, json=payload, headers=auth_headers(token)
    )
    assert create_resp.status_code == 201
    location_id = create_resp.json()["id"]

    # Delete
    response = await client.delete(
        f"{BASE_URL}/{location_id}",
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert "deleted" in data["message"].lower()

    # Verify it no longer exists
    get_resp = await client.get(
        f"{BASE_URL}/{location_id}",
        headers=auth_headers(token),
    )
    assert get_resp.status_code == 404


# ── Location not found ────────────────────────────────────────────────


async def test_location_not_found(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: User,
) -> None:
    """Getting a non-existent location returns 404."""
    await _setup_locations_module(db_session, tenant)
    token = _make_token(tenant_admin_user, modules=["locations"])

    fake_id = uuid.uuid4()
    response = await client.get(
        f"{BASE_URL}/{fake_id}",
        headers=auth_headers(token),
    )
    assert response.status_code == 404


# ── Link / Unlink location to conference ──────────────────────────────


async def test_link_location_to_conference(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    tenant_admin_user: User,
) -> None:
    """Creating a location links it to the specified conference."""
    await _setup_locations_module(db_session, tenant)
    await _setup_location_type(db_session, tenant, conference)
    token = _make_token(tenant_admin_user, modules=["locations"])

    payload = _location_payload(conference.id)
    create_resp = await client.post(
        BASE_URL, json=payload, headers=auth_headers(token)
    )
    assert create_resp.status_code == 201
    data = create_resp.json()
    # The conference_ids should contain the conference we passed
    assert str(conference.id) in data["conference_ids"]

    # Verify via GET as well
    location_id = data["id"]
    get_resp = await client.get(
        f"{BASE_URL}/{location_id}",
        headers=auth_headers(token),
    )
    assert get_resp.status_code == 200
    assert str(conference.id) in get_resp.json()["conference_ids"]


async def test_unlink_location_from_conference(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    tenant_admin_user: User,
) -> None:
    """Deleting a location with conference_id unlinks it when linked to multiple conferences."""
    await _setup_locations_module(db_session, tenant)
    await _setup_location_type(db_session, tenant, conference)
    token = _make_token(tenant_admin_user, modules=["locations"])

    # Create location linked to first conference
    payload = _location_payload(conference.id)
    create_resp = await client.post(
        BASE_URL, json=payload, headers=auth_headers(token)
    )
    assert create_resp.status_code == 201
    location_id = create_resp.json()["id"]

    # Create a second conference
    conf2 = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Second Conf",
        abbreviation="SC2",
        is_active=True,
    )
    db_session.add(conf2)
    await db_session.flush()
    # Manually link the location to the second conference
    db_session.add(
        ConferenceLocation(
            conference_id=conf2.id,
            location_id=uuid.UUID(location_id),
        )
    )
    await db_session.commit()

    # Now delete with conference_id of the first conference -- should only unlink
    response = await client.delete(
        f"{BASE_URL}/{location_id}",
        params={"conference_id": str(conference.id)},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    data = response.json()
    assert "unlinked" in data["message"].lower()

    # Location should still exist (linked to conf2)
    get_resp = await client.get(
        f"{BASE_URL}/{location_id}",
        headers=auth_headers(token),
    )
    assert get_resp.status_code == 200
    # Should only have conf2 now
    assert str(conference.id) not in get_resp.json()["conference_ids"]
    assert str(conf2.id) in get_resp.json()["conference_ids"]
