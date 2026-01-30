"""Integration tests for conference-scoped settings endpoints: pronouns and volunteer roles."""

import uuid

from httpx import AsyncClient

from app.models.conference import Conference
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers


def _pronouns_url(conference_id: uuid.UUID) -> str:
    """Build the base URL for pronoun options under a conference."""
    return f"/api/v1/conferences/{conference_id}/settings/pronouns"


def _volunteer_roles_url(conference_id: uuid.UUID) -> str:
    """Build the base URL for volunteer roles under a conference."""
    return f"/api/v1/conferences/{conference_id}/settings/volunteer-roles"


# ── Pronoun Options ─────────────────────────────────────────────────────


async def test_list_pronouns_empty(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Listing pronoun options returns an empty list when none exist."""
    response = await client.get(
        _pronouns_url(conference.id),
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0


async def test_create_pronoun_option(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can create a pronoun option and receives 200."""
    payload = {"name": "he/him", "is_active": True}
    response = await client.post(
        _pronouns_url(conference.id),
        json=payload,
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "he/him"
    assert data["is_active"] is True
    assert data["conference_id"] == str(conference.id)
    assert data["tenant_id"] == str(conference.tenant_id)
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


async def test_create_duplicate_pronoun_name(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Creating a pronoun option with a duplicate name returns 400."""
    payload = {"name": "she/her", "is_active": True}
    # First creation should succeed
    resp1 = await client.post(
        _pronouns_url(conference.id),
        json=payload,
        headers=auth_headers(tenant_admin_token),
    )
    assert resp1.status_code == 200

    # Second creation with same name should fail
    resp2 = await client.post(
        _pronouns_url(conference.id),
        json=payload,
        headers=auth_headers(tenant_admin_token),
    )
    assert resp2.status_code == 400


async def test_list_pronouns_after_create(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Listing pronoun options returns the created item."""
    payload = {"name": "they/them", "is_active": True}
    create_resp = await client.post(
        _pronouns_url(conference.id),
        json=payload,
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 200

    list_resp = await client.get(
        _pronouns_url(conference.id),
        headers=auth_headers(tenant_admin_token),
    )
    assert list_resp.status_code == 200
    data = list_resp.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["name"] == "they/them"


async def test_update_pronoun_name(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can update a pronoun option name."""
    # Create
    create_resp = await client.post(
        _pronouns_url(conference.id),
        json={"name": "he/him", "is_active": True},
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 200
    option_id = create_resp.json()["id"]

    # Update name
    update_resp = await client.put(
        f"{_pronouns_url(conference.id)}/{option_id}",
        json={"name": "they/them"},
        headers=auth_headers(tenant_admin_token),
    )
    assert update_resp.status_code == 200
    data = update_resp.json()
    assert data["name"] == "they/them"
    assert data["id"] == option_id


async def test_update_pronoun_is_active(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can deactivate a pronoun option."""
    # Create
    create_resp = await client.post(
        _pronouns_url(conference.id),
        json={"name": "xe/xem", "is_active": True},
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 200
    option_id = create_resp.json()["id"]

    # Update is_active to false
    update_resp = await client.put(
        f"{_pronouns_url(conference.id)}/{option_id}",
        json={"is_active": False},
        headers=auth_headers(tenant_admin_token),
    )
    assert update_resp.status_code == 200
    data = update_resp.json()
    assert data["is_active"] is False
    assert data["id"] == option_id


async def test_delete_pronoun_option(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can delete a pronoun option."""
    # Create
    create_resp = await client.post(
        _pronouns_url(conference.id),
        json={"name": "ze/zir", "is_active": True},
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 200
    option_id = create_resp.json()["id"]

    # Delete
    delete_resp = await client.delete(
        f"{_pronouns_url(conference.id)}/{option_id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert delete_resp.status_code == 200

    # Verify the list is now empty
    list_resp = await client.get(
        _pronouns_url(conference.id),
        headers=auth_headers(tenant_admin_token),
    )
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 0


async def test_regular_user_cannot_create_pronoun(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    regular_user: User,
    regular_user_token: str,
) -> None:
    """Regular user (non-admin) gets 403 when trying to create a pronoun option."""
    payload = {"name": "he/him", "is_active": True}
    response = await client.post(
        _pronouns_url(conference.id),
        json=payload,
        headers=auth_headers(regular_user_token),
    )
    assert response.status_code == 403


# ── Volunteer Roles ─────────────────────────────────────────────────────


async def test_create_volunteer_role(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can create a volunteer role."""
    payload = {
        "name": "Stage Manager",
        "description": "Manages stage",
        "is_active": True,
    }
    response = await client.post(
        _volunteer_roles_url(conference.id),
        json=payload,
        headers=auth_headers(tenant_admin_token),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Stage Manager"
    assert data["description"] == "Manages stage"
    assert data["is_active"] is True
    assert data["conference_id"] == str(conference.id)
    assert data["tenant_id"] == str(conference.tenant_id)
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


async def test_list_volunteer_roles(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Listing volunteer roles returns the created role."""
    payload = {
        "name": "Registration Desk",
        "description": "Handles registration",
        "is_active": True,
    }
    create_resp = await client.post(
        _volunteer_roles_url(conference.id),
        json=payload,
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 200

    list_resp = await client.get(
        _volunteer_roles_url(conference.id),
        headers=auth_headers(tenant_admin_token),
    )
    assert list_resp.status_code == 200
    data = list_resp.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["name"] == "Registration Desk"
    assert data["items"][0]["description"] == "Handles registration"


async def test_update_volunteer_role_name(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can update a volunteer role name."""
    # Create
    create_resp = await client.post(
        _volunteer_roles_url(conference.id),
        json={"name": "Stage Manager", "description": "Manages stage", "is_active": True},
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 200
    role_id = create_resp.json()["id"]

    # Update name
    update_resp = await client.put(
        f"{_volunteer_roles_url(conference.id)}/{role_id}",
        json={"name": "Updated Name"},
        headers=auth_headers(tenant_admin_token),
    )
    assert update_resp.status_code == 200
    data = update_resp.json()
    assert data["name"] == "Updated Name"
    assert data["id"] == role_id
    # Description should remain unchanged
    assert data["description"] == "Manages stage"


async def test_delete_volunteer_role(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can delete a volunteer role."""
    # Create
    create_resp = await client.post(
        _volunteer_roles_url(conference.id),
        json={"name": "AV Support", "description": "Audio/video support", "is_active": True},
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 200
    role_id = create_resp.json()["id"]

    # Delete
    delete_resp = await client.delete(
        f"{_volunteer_roles_url(conference.id)}/{role_id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert delete_resp.status_code == 200

    # Verify the list is now empty
    list_resp = await client.get(
        _volunteer_roles_url(conference.id),
        headers=auth_headers(tenant_admin_token),
    )
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 0
