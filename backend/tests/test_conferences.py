"""Integration tests for the conference CRUD API endpoints."""

import uuid

from httpx import AsyncClient

from app.models.conference import Conference
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers


BASE_URL = "/api/v1/conferences"

CONFERENCE_PAYLOAD = {
    "name": "My Conference",
    "abbreviation": "MC",
    "description": "A test conference",
    "start_date": "2026-06-01",
    "end_date": "2026-06-03",
    "city": "Berlin",
    "country": "Germany",
    "venue_type": "onsite",
}


# ── List conferences ────────────────────────────────────────────────────


async def test_list_conferences_empty(
    client: AsyncClient,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin listing conferences returns an empty list when none exist."""
    response = await client.get(
        BASE_URL,
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1


async def test_list_conferences_with_one(
    client: AsyncClient,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
    conference: Conference,
) -> None:
    """Tenant admin listing conferences returns the existing conference."""
    response = await client.get(
        BASE_URL,
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["id"] == str(conference.id)
    assert data["items"][0]["name"] == conference.name


# ── Create conference ───────────────────────────────────────────────────


async def test_create_conference_success(
    client: AsyncClient,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can create a conference and receives 201."""
    response = await client.post(
        BASE_URL,
        json=CONFERENCE_PAYLOAD,
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == CONFERENCE_PAYLOAD["name"]
    assert data["abbreviation"] == CONFERENCE_PAYLOAD["abbreviation"]
    assert data["description"] == CONFERENCE_PAYLOAD["description"]
    assert data["start_date"] == CONFERENCE_PAYLOAD["start_date"]
    assert data["end_date"] == CONFERENCE_PAYLOAD["end_date"]
    assert data["city"] == CONFERENCE_PAYLOAD["city"]
    assert data["country"] == CONFERENCE_PAYLOAD["country"]
    assert data["venue_type"] == CONFERENCE_PAYLOAD["venue_type"]
    assert data["is_active"] is True
    assert "id" in data
    assert "tenant_id" in data


async def test_create_conference_seeds_default_settings(
    client: AsyncClient,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Creating a conference via API seeds default pronoun options and volunteer roles."""
    # Create conference
    response = await client.post(
        BASE_URL,
        json=CONFERENCE_PAYLOAD,
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 201
    conference_id = response.json()["id"]

    # Check that pronouns were seeded
    pronouns_response = await client.get(
        f"{BASE_URL}/{conference_id}/settings/pronouns",
        headers=auth_headers(tenant_admin_token),
    )
    assert pronouns_response.status_code == 200
    pronouns = pronouns_response.json()
    assert pronouns["total"] >= 6  # At least 6 default pronouns

    # Check that volunteer roles were seeded
    roles_response = await client.get(
        f"{BASE_URL}/{conference_id}/settings/volunteer-roles",
        headers=auth_headers(tenant_admin_token),
    )
    assert roles_response.status_code == 200
    roles = roles_response.json()
    assert roles["total"] >= 6  # At least 6 default volunteer roles

    # Check that committee roles were seeded
    committee_roles_response = await client.get(
        f"{BASE_URL}/{conference_id}/settings/committee-roles",
        headers=auth_headers(tenant_admin_token),
    )
    assert committee_roles_response.status_code == 200
    committee_roles = committee_roles_response.json()
    assert committee_roles["total"] >= 4  # At least 4 default committee roles

    # Check that score scales were seeded
    scales_response = await client.get(
        f"{BASE_URL}/{conference_id}/settings/score-scales",
        headers=auth_headers(tenant_admin_token),
    )
    assert scales_response.status_code == 200
    scales = scales_response.json()
    assert scales["total"] >= 3  # At least 3 default score scales


async def test_create_conference_forbidden_for_regular_user(
    client: AsyncClient,
    tenant_with_modules: Tenant,
    regular_user: User,
    regular_user_token: str,
) -> None:
    """Regular user (non-admin) gets 403 when trying to create a conference."""
    response = await client.post(
        BASE_URL,
        json=CONFERENCE_PAYLOAD,
        headers=auth_headers(regular_user_token),
    )
    assert response.status_code == 403


# ── Get conference by ID ────────────────────────────────────────────────


async def test_get_conference_by_id(
    client: AsyncClient,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
    conference: Conference,
) -> None:
    """Get a conference by ID returns the correct conference."""
    response = await client.get(
        f"{BASE_URL}/{conference.id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(conference.id)
    assert data["name"] == conference.name
    assert data["abbreviation"] == conference.abbreviation
    assert data["tenant_id"] == str(conference.tenant_id)


async def test_get_conference_not_found(
    client: AsyncClient,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Get a non-existent conference returns 404."""
    fake_id = uuid.uuid4()
    response = await client.get(
        f"{BASE_URL}/{fake_id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 404


# ── Update conference ───────────────────────────────────────────────────


async def test_update_conference_name(
    client: AsyncClient,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
    conference: Conference,
) -> None:
    """Tenant admin can update a conference name."""
    new_name = "Updated Conference Name"
    response = await client.put(
        f"{BASE_URL}/{conference.id}",
        json={"name": new_name},
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(conference.id)
    assert data["name"] == new_name


async def test_update_conference_partial(
    client: AsyncClient,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
    conference: Conference,
) -> None:
    """Partial update only changes the provided fields."""
    response = await client.put(
        f"{BASE_URL}/{conference.id}",
        json={"city": "Munich", "country": "Germany"},
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["city"] == "Munich"
    assert data["country"] == "Germany"
    # Original name should remain unchanged
    assert data["name"] == conference.name


# ── Delete conference ───────────────────────────────────────────────────


async def test_delete_conference(
    client: AsyncClient,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
    conference: Conference,
) -> None:
    """Tenant admin can delete a conference."""
    response = await client.delete(
        f"{BASE_URL}/{conference.id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert "deleted" in data["message"].lower() or "deleted" in data["message"]

    # Verify the conference no longer exists
    get_response = await client.get(
        f"{BASE_URL}/{conference.id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert get_response.status_code == 404


async def test_delete_conference_not_found(
    client: AsyncClient,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Deleting a non-existent conference returns 404."""
    fake_id = uuid.uuid4()
    response = await client.delete(
        f"{BASE_URL}/{fake_id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 404


# ── Stats ───────────────────────────────────────────────────────────────


async def test_get_conference_stats_empty(
    client: AsyncClient,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Stats endpoint returns zeroes when no conferences exist."""
    response = await client.get(
        f"{BASE_URL}/stats",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["active"] == 0
    assert data["published"] == 0
    assert data["upcoming"] == 0
    assert data["ongoing"] == 0
    assert data["past"] == 0


async def test_get_conference_stats_with_conference(
    client: AsyncClient,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
    conference: Conference,
) -> None:
    """Stats endpoint counts the existing conference."""
    response = await client.get(
        f"{BASE_URL}/stats",
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["active"] == 1  # conference fixture has is_active=True
