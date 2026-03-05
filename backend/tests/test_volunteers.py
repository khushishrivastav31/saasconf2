"""Tests for volunteer CRUD endpoints."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.models.associations import ConferenceVolunteer
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User
from app.models.volunteer import Volunteer, VolunteerStatus
from tests.conftest import auth_headers

# ── Helpers ────────────────────────────────────────────────────────────


def _make_token(user: User, modules: list[str] | None = None) -> str:
    """Create a valid JWT access token for a user."""
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


VOLUNTEERS_URL = "/api/v1/volunteers"


VOLUNTEER_PAYLOAD = {
    "email": "volunteer@example.com",
    "first_name": "Jane",
    "last_name": "Doe",
    "phone": "+491701234567",
    "role": "Registration Desk",
    "skills": ["languages", "customer service"],
    "availability": {"day1": True, "day2": True},
    "notes": "Experienced volunteer",
    "emergency_contact_name": "John Doe",
    "emergency_contact_phone": "+491709876543",
    "tshirt_size": "M",
}


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def volunteers_module(db_session: AsyncSession) -> Module:
    """Create the 'volunteers' module."""
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
async def tenant_with_volunteers_module(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    volunteers_module: Module,
) -> Tenant:
    """Associate both conferences and volunteers modules with the test tenant."""
    for mod in (conferences_module, volunteers_module):
        db_session.add(
            TenantModule(
                id=uuid.uuid4(),
                tenant_id=tenant.id,
                module_id=mod.id,
                is_enabled=True,
            )
        )
    await db_session.commit()
    return tenant


@pytest.fixture()
def admin_token_volunteers(tenant_admin_user: User) -> str:
    """Return a valid access token for the tenant admin with volunteers module."""
    return _make_token(tenant_admin_user, modules=["volunteers"])


@pytest.fixture()
def user_token_volunteers(regular_user: User) -> str:
    """Return a valid access token for a regular user with volunteers module."""
    return _make_token(regular_user, modules=["volunteers"])


@pytest_asyncio.fixture()
async def sample_volunteer(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> Volunteer:
    """Create a sample volunteer directly in the database with a conference association."""
    volunteer = Volunteer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="seed-volunteer@example.com",
        first_name="Seed",
        last_name="Volunteer",
        phone="+491701111111",
        status=VolunteerStatus.PENDING.value,
        role="Speaker Liaison",
        skills=["coordination"],
        availability={"day1": True},
        notes="Seeded volunteer",
        tshirt_size="L",
        total_hours=0.0,
    )
    db_session.add(volunteer)
    await db_session.flush()

    # Create conference association
    db_session.add(
        ConferenceVolunteer(
            conference_id=conference.id,
            volunteer_id=volunteer.id,
        )
    )
    await db_session.commit()
    await db_session.refresh(volunteer)
    return volunteer


# ═══════════════════════════════════════════════════════════════════════
# 1. LIST VOLUNTEERS
# ═══════════════════════════════════════════════════════════════════════


async def test_list_volunteers_empty(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
) -> None:
    """Listing volunteers returns an empty list when none exist."""
    response = await client.get(
        VOLUNTEERS_URL,
        headers=auth_headers(admin_token_volunteers),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1
    assert data["pages"] == 0


async def test_list_volunteers_with_data(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    sample_volunteer: Volunteer,
) -> None:
    """Listing volunteers returns existing volunteers."""
    response = await client.get(
        VOLUNTEERS_URL,
        headers=auth_headers(admin_token_volunteers),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["email"] == "seed-volunteer@example.com"
    assert data["items"][0]["first_name"] == "Seed"
    assert data["items"][0]["last_name"] == "Volunteer"
    assert data["items"][0]["id"] == str(sample_volunteer.id)


async def test_list_volunteers_filter_by_status(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    sample_volunteer: Volunteer,
) -> None:
    """Filtering volunteers by status returns only matching volunteers."""
    # Sample volunteer is pending
    response = await client.get(
        VOLUNTEERS_URL,
        params={"status": "pending"},
        headers=auth_headers(admin_token_volunteers),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "pending"

    # No approved volunteers
    response = await client.get(
        VOLUNTEERS_URL,
        params={"status": "approved"},
        headers=auth_headers(admin_token_volunteers),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0


# ═══════════════════════════════════════════════════════════════════════
# 2. CREATE VOLUNTEER
# ═══════════════════════════════════════════════════════════════════════


async def test_create_volunteer_success(
    client: AsyncClient,
    conference: Conference,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
) -> None:
    """Tenant admin can create a volunteer and receives 201."""
    payload = {
        **VOLUNTEER_PAYLOAD,
        "conference_id": str(conference.id),
    }
    response = await client.post(
        VOLUNTEERS_URL,
        json=payload,
        headers=auth_headers(admin_token_volunteers),
    )

    assert response.status_code == 201
    data = response.json()
    assert data["email"] == VOLUNTEER_PAYLOAD["email"]
    assert data["first_name"] == VOLUNTEER_PAYLOAD["first_name"]
    assert data["last_name"] == VOLUNTEER_PAYLOAD["last_name"]
    assert data["full_name"] == "Jane Doe"
    assert data["phone"] == VOLUNTEER_PAYLOAD["phone"]
    assert data["role"] == VOLUNTEER_PAYLOAD["role"]
    assert data["skills"] == VOLUNTEER_PAYLOAD["skills"]
    assert data["availability"] == VOLUNTEER_PAYLOAD["availability"]
    assert data["notes"] == VOLUNTEER_PAYLOAD["notes"]
    assert data["emergency_contact_name"] == VOLUNTEER_PAYLOAD["emergency_contact_name"]
    assert data["emergency_contact_phone"] == VOLUNTEER_PAYLOAD["emergency_contact_phone"]
    assert data["tshirt_size"] == VOLUNTEER_PAYLOAD["tshirt_size"]
    assert data["status"] == "pending"
    assert data["total_hours"] == 0.0
    assert data["approved_date"] is None
    assert "id" in data
    assert "tenant_id" in data
    assert "created_at" in data
    assert "updated_at" in data
    # Conference association
    assert str(conference.id) in data["conference_ids"]


async def test_create_volunteer_forbidden_for_regular_user(
    client: AsyncClient,
    conference: Conference,
    tenant_with_volunteers_module: Tenant,
    regular_user: User,
    user_token_volunteers: str,
) -> None:
    """Regular user (non-admin) cannot create a volunteer and gets 403."""
    payload = {
        **VOLUNTEER_PAYLOAD,
        "conference_id": str(conference.id),
    }
    response = await client.post(
        VOLUNTEERS_URL,
        json=payload,
        headers=auth_headers(user_token_volunteers),
    )

    assert response.status_code == 403


async def test_create_volunteer_no_auth_401(
    client: AsyncClient,
    conference: Conference,
    tenant_with_volunteers_module: Tenant,
) -> None:
    """Creating a volunteer without authentication returns 401."""
    payload = {
        **VOLUNTEER_PAYLOAD,
        "conference_id": str(conference.id),
    }
    response = await client.post(VOLUNTEERS_URL, json=payload)

    assert response.status_code == 401


async def test_create_volunteer_duplicate_email(
    client: AsyncClient,
    conference: Conference,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    sample_volunteer: Volunteer,
) -> None:
    """Creating a volunteer with a duplicate email returns 409 or 422."""
    payload = {
        "email": "seed-volunteer@example.com",  # Same as sample_volunteer
        "first_name": "Duplicate",
        "last_name": "Volunteer",
        "conference_id": str(conference.id),
    }
    response = await client.post(
        VOLUNTEERS_URL,
        json=payload,
        headers=auth_headers(admin_token_volunteers),
    )

    # Should fail with validation error (409 is the convention for duplicate)
    assert response.status_code in (400, 409, 422)


async def test_create_volunteer_conference_not_found(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
) -> None:
    """Creating a volunteer with a non-existent conference_id returns 404."""
    payload = {
        **VOLUNTEER_PAYLOAD,
        "conference_id": str(uuid.uuid4()),
    }
    response = await client.post(
        VOLUNTEERS_URL,
        json=payload,
        headers=auth_headers(admin_token_volunteers),
    )

    assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 3. GET VOLUNTEER
# ═══════════════════════════════════════════════════════════════════════


async def test_get_volunteer_by_id(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    sample_volunteer: Volunteer,
    conference: Conference,
) -> None:
    """Get a volunteer by ID returns all expected fields."""
    response = await client.get(
        f"{VOLUNTEERS_URL}/{sample_volunteer.id}",
        headers=auth_headers(admin_token_volunteers),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(sample_volunteer.id)
    assert data["email"] == "seed-volunteer@example.com"
    assert data["first_name"] == "Seed"
    assert data["last_name"] == "Volunteer"
    assert data["full_name"] == "Seed Volunteer"
    assert data["phone"] == "+491701111111"
    assert data["status"] == "pending"
    assert data["role"] == "Speaker Liaison"
    assert data["skills"] == ["coordination"]
    assert data["tshirt_size"] == "L"
    assert "created_at" in data
    assert "updated_at" in data
    # Conference association
    assert str(conference.id) in data["conference_ids"]


async def test_get_volunteer_not_found(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
) -> None:
    """Getting a non-existent volunteer returns 404."""
    fake_id = uuid.uuid4()
    response = await client.get(
        f"{VOLUNTEERS_URL}/{fake_id}",
        headers=auth_headers(admin_token_volunteers),
    )

    assert response.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# 4. UPDATE VOLUNTEER
# ═══════════════════════════════════════════════════════════════════════


async def test_update_volunteer(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    sample_volunteer: Volunteer,
) -> None:
    """Tenant admin can update a volunteer."""
    payload = {
        "first_name": "Updated",
        "last_name": "Name",
        "role": "Stage Manager",
        "notes": "Updated notes",
    }
    response = await client.put(
        f"{VOLUNTEERS_URL}/{sample_volunteer.id}",
        json=payload,
        headers=auth_headers(admin_token_volunteers),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["first_name"] == "Updated"
    assert data["last_name"] == "Name"
    assert data["full_name"] == "Updated Name"
    assert data["role"] == "Stage Manager"
    assert data["notes"] == "Updated notes"
    # Unchanged fields
    assert data["email"] == "seed-volunteer@example.com"
    assert data["id"] == str(sample_volunteer.id)


async def test_update_volunteer_status(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    sample_volunteer: Volunteer,
) -> None:
    """Updating volunteer status to 'approved' sets the approved_date."""
    payload = {"status": "approved"}
    response = await client.put(
        f"{VOLUNTEERS_URL}/{sample_volunteer.id}",
        json=payload,
        headers=auth_headers(admin_token_volunteers),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "approved"
    assert data["approved_date"] is not None


async def test_update_volunteer_not_found(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
) -> None:
    """Updating a non-existent volunteer returns 404."""
    fake_id = uuid.uuid4()
    payload = {"first_name": "Ghost"}
    response = await client.put(
        f"{VOLUNTEERS_URL}/{fake_id}",
        json=payload,
        headers=auth_headers(admin_token_volunteers),
    )

    assert response.status_code == 404


async def test_update_volunteer_forbidden_for_regular_user(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    regular_user: User,
    user_token_volunteers: str,
    sample_volunteer: Volunteer,
) -> None:
    """Regular user cannot update a volunteer and gets 403."""
    payload = {"first_name": "Forbidden"}
    response = await client.put(
        f"{VOLUNTEERS_URL}/{sample_volunteer.id}",
        json=payload,
        headers=auth_headers(user_token_volunteers),
    )

    assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════════════
# 5. DELETE VOLUNTEER
# ═══════════════════════════════════════════════════════════════════════


async def test_delete_volunteer(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    sample_volunteer: Volunteer,
) -> None:
    """Tenant admin can delete a volunteer."""
    response = await client.delete(
        f"{VOLUNTEERS_URL}/{sample_volunteer.id}",
        headers=auth_headers(admin_token_volunteers),
    )

    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert "deleted" in data["message"].lower()


async def test_delete_volunteer_verify_gone(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    sample_volunteer: Volunteer,
) -> None:
    """After deleting a volunteer, GET returns 404."""
    url = f"{VOLUNTEERS_URL}/{sample_volunteer.id}"

    # Delete
    delete_response = await client.delete(
        url,
        headers=auth_headers(admin_token_volunteers),
    )
    assert delete_response.status_code == 200

    # Verify GET returns 404
    get_response = await client.get(
        url,
        headers=auth_headers(admin_token_volunteers),
    )
    assert get_response.status_code == 404


async def test_delete_volunteer_not_found(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
) -> None:
    """Deleting a non-existent volunteer returns 404."""
    fake_id = uuid.uuid4()
    response = await client.delete(
        f"{VOLUNTEERS_URL}/{fake_id}",
        headers=auth_headers(admin_token_volunteers),
    )

    assert response.status_code == 404


async def test_delete_volunteer_forbidden_for_regular_user(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    regular_user: User,
    user_token_volunteers: str,
    sample_volunteer: Volunteer,
) -> None:
    """Regular user cannot delete a volunteer and gets 403."""
    response = await client.delete(
        f"{VOLUNTEERS_URL}/{sample_volunteer.id}",
        headers=auth_headers(user_token_volunteers),
    )

    assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════════════
# 6. APPROVE VOLUNTEER
# ═══════════════════════════════════════════════════════════════════════


async def test_approve_volunteer(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    sample_volunteer: Volunteer,
    conference: Conference,
) -> None:
    """Tenant admin can approve a volunteer via the dedicated endpoint."""
    response = await client.post(
        f"{VOLUNTEERS_URL}/{sample_volunteer.id}/approve",
        headers=auth_headers(admin_token_volunteers),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "approved"
    assert data["approved_date"] is not None
    assert data["id"] == str(sample_volunteer.id)
    assert data["email"] == "seed-volunteer@example.com"
    # Conference association should be preserved
    assert str(conference.id) in data["conference_ids"]


async def test_approve_volunteer_not_found(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
) -> None:
    """Approving a non-existent volunteer returns 404."""
    fake_id = uuid.uuid4()
    response = await client.post(
        f"{VOLUNTEERS_URL}/{fake_id}/approve",
        headers=auth_headers(admin_token_volunteers),
    )

    assert response.status_code == 404


async def test_approve_volunteer_forbidden_for_regular_user(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    regular_user: User,
    user_token_volunteers: str,
    sample_volunteer: Volunteer,
) -> None:
    """Regular user cannot approve a volunteer and gets 403."""
    response = await client.post(
        f"{VOLUNTEERS_URL}/{sample_volunteer.id}/approve",
        headers=auth_headers(user_token_volunteers),
    )

    assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════════════
# 7. VOLUNTEER STATS
# ═══════════════════════════════════════════════════════════════════════


async def test_volunteer_stats_empty(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
) -> None:
    """Volunteer stats returns zeroes when no volunteers exist."""
    response = await client.get(
        f"{VOLUNTEERS_URL}/stats",
        headers=auth_headers(admin_token_volunteers),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 0
    assert data["pending"] == 0
    assert data["approved"] == 0
    assert data["active"] == 0
    assert data["inactive"] == 0
    assert data["rejected"] == 0
    assert data["total_hours"] == 0.0


async def test_volunteer_stats_with_data(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    sample_volunteer: Volunteer,
) -> None:
    """Volunteer stats counts existing volunteers correctly."""
    response = await client.get(
        f"{VOLUNTEERS_URL}/stats",
        headers=auth_headers(admin_token_volunteers),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["pending"] == 1  # sample_volunteer is pending
    assert data["approved"] == 0
    assert data["active"] == 0
    assert data["inactive"] == 0
    assert data["rejected"] == 0


async def test_volunteer_stats_after_approval(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    sample_volunteer: Volunteer,
) -> None:
    """Volunteer stats reflect changes after approving a volunteer."""
    # Approve the volunteer
    approve_response = await client.post(
        f"{VOLUNTEERS_URL}/{sample_volunteer.id}/approve",
        headers=auth_headers(admin_token_volunteers),
    )
    assert approve_response.status_code == 200

    # Check stats
    response = await client.get(
        f"{VOLUNTEERS_URL}/stats",
        headers=auth_headers(admin_token_volunteers),
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["pending"] == 0
    assert data["approved"] == 1
