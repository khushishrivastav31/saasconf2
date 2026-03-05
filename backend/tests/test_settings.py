"""Integration tests for conference-scoped settings endpoints: pronouns, volunteer roles, sponsor packages, session types."""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cfp import CallForPapers, CFPApplicant, CFPPaper
from app.models.conference import Conference
from app.models.sponsor import Sponsor
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers


def _pronouns_url(conference_id: uuid.UUID) -> str:
    """Build the base URL for pronoun options under a conference."""
    return f"/api/v1/conferences/{conference_id}/settings/pronouns"


def _volunteer_roles_url(conference_id: uuid.UUID) -> str:
    """Build the base URL for volunteer roles under a conference."""
    return f"/api/v1/conferences/{conference_id}/settings/volunteer-roles"


def _sponsor_packages_url(conference_id: uuid.UUID) -> str:
    """Build the base URL for sponsor packages under a conference."""
    return f"/api/v1/conferences/{conference_id}/settings/sponsor-packages"


def _session_types_url(conference_id: uuid.UUID) -> str:
    """Build the base URL for session types under a conference."""
    return f"/api/v1/conferences/{conference_id}/settings/session-types"


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


# ── Sponsor Packages ────────────────────────────────────────────────────


async def test_delete_sponsor_package_without_sponsors(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can delete a sponsor package with no sponsors."""
    # Create package
    create_resp = await client.post(
        _sponsor_packages_url(conference.id),
        json={"name": "Gold", "description": "Gold tier sponsors", "price": 5000, "is_active": True},
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 200
    package_id = create_resp.json()["id"]

    # Delete
    delete_resp = await client.delete(
        f"{_sponsor_packages_url(conference.id)}/{package_id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert delete_resp.status_code == 200


async def test_delete_sponsor_package_with_sponsors_fails(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Deleting a sponsor package that has sponsors returns 400."""
    # Create package via API
    create_resp = await client.post(
        _sponsor_packages_url(conference.id),
        json={"name": "Platinum", "description": "Platinum tier", "price": 10000, "is_active": True},
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 200
    package_id = create_resp.json()["id"]

    # Create a sponsor that uses this package directly in DB
    sponsor = Sponsor(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        conference_id=conference.id,
        sponsor_package_id=uuid.UUID(package_id),
        company_name="Test Corp",
    )
    db_session.add(sponsor)
    await db_session.commit()

    # Try to delete package - should fail
    delete_resp = await client.delete(
        f"{_sponsor_packages_url(conference.id)}/{package_id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert delete_resp.status_code == 400
    data = delete_resp.json()
    assert "Cannot delete" in data["detail"]
    assert "1 sponsor" in data["detail"]


# ── Session Types ───────────────────────────────────────────────────────


async def test_delete_session_type_without_papers(
    client: AsyncClient,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Tenant admin can delete a session type with no papers."""
    # Create session type
    create_resp = await client.post(
        _session_types_url(conference.id),
        json={"name": "Workshop", "slug": "workshop", "duration_minutes": 120, "is_active": True},
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 200
    session_type_id = create_resp.json()["id"]

    # Delete
    delete_resp = await client.delete(
        f"{_session_types_url(conference.id)}/{session_type_id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert delete_resp.status_code == 200


async def test_delete_session_type_with_papers_fails(
    client: AsyncClient,
    db_session: AsyncSession,
    conference: Conference,
    tenant_with_modules: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
) -> None:
    """Deleting a session type that has papers returns 400."""
    # Create session type via API
    create_resp = await client.post(
        _session_types_url(conference.id),
        json={"name": "Talk", "slug": "talk", "duration_minutes": 45, "is_active": True},
        headers=auth_headers(tenant_admin_token),
    )
    assert create_resp.status_code == 200
    session_type_id = create_resp.json()["id"]

    # Create prerequisite data in DB: CFP -> Applicant -> Paper
    cfp = CallForPapers(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        title="Test CFP",
    )
    db_session.add(cfp)
    await db_session.flush()

    applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        email="speaker@test.com",
        first_name="Test",
        last_name="Speaker",
        password_hash="dummy_hash_for_test",
    )
    db_session.add(applicant)
    await db_session.flush()

    paper = CFPPaper(
        id=uuid.uuid4(),
        tenant_id=conference.tenant_id,
        cfp_id=cfp.id,
        main_speaker_id=applicant.id,
        session_type_id=uuid.UUID(session_type_id),
        title="My Test Paper",
    )
    db_session.add(paper)
    await db_session.commit()

    # Try to delete session type - should fail
    delete_resp = await client.delete(
        f"{_session_types_url(conference.id)}/{session_type_id}",
        headers=auth_headers(tenant_admin_token),
    )
    assert delete_resp.status_code == 400
    data = delete_resp.json()
    assert "Cannot delete" in data["detail"]
    assert "1 paper" in data["detail"]
