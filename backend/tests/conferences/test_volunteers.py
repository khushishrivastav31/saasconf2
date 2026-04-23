"""Tests for volunteer profile endpoints (role-based volunteer system)."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.cfp_applicants import CFPApplicant
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.settings import UserRole, UserRoleAssignment
from app.models.tenant import Tenant
from app.models.user import User
from app.models.volunteer_profile import VolunteerProfile
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
    return _make_token(tenant_admin_user, modules=["volunteers"])


@pytest.fixture()
def user_token_volunteers(regular_user: User) -> str:
    return _make_token(regular_user, modules=["volunteers"])


@pytest_asyncio.fixture()
async def volunteer_role(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> UserRole:
    """Create the Volunteer system role for the conference."""
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
async def volunteer_applicant(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    volunteer_role: UserRole,
    tenant_admin_user: User,
) -> CFPApplicant:
    """Create an applicant with the Volunteer role assigned."""
    applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="volunteer@example.com",
        first_name="Jane",
        last_name="Doe",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(applicant)
    await db_session.flush()

    assignment = UserRoleAssignment(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        user_role_id=volunteer_role.id,
        applicant_id=applicant.id,
        assigned_by=tenant_admin_user.id,
    )
    db_session.add(assignment)
    await db_session.commit()
    return applicant


@pytest_asyncio.fixture()
async def volunteer_profile(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    volunteer_applicant: CFPApplicant,
) -> VolunteerProfile:
    """Create a volunteer profile for the applicant."""
    profile = VolunteerProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        applicant_id=volunteer_applicant.id,
        tshirt_size="M",
        emergency_contact_name="John Doe",
        emergency_contact_phone="+491709876543",
        skills=["languages", "customer service"],
        availability={"day1": True, "day2": True},
        notes="Experienced volunteer",
        color="#3B82F6",
        total_hours=0.0,
    )
    db_session.add(profile)
    await db_session.commit()
    return profile


# ═══════════════════════════════════════════════════════════════════════
# 1. LIST VOLUNTEER PROFILES
# ═══════════════════════════════════════════════════════════════════════


async def test_list_volunteer_profiles_empty(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    conference: Conference,
    volunteer_role: UserRole,
) -> None:
    """Listing profiles returns empty when no volunteers assigned."""
    response = await client.get(
        f"/api/v1/conferences/{conference.id}/volunteer-profiles",
        headers=auth_headers(admin_token_volunteers),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0


async def test_list_volunteer_profiles_with_data(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    conference: Conference,
    volunteer_applicant: CFPApplicant,
    volunteer_profile: VolunteerProfile,
) -> None:
    """Listing profiles returns profiles for volunteers with the role."""
    response = await client.get(
        f"/api/v1/conferences/{conference.id}/volunteer-profiles",
        headers=auth_headers(admin_token_volunteers),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["applicant_id"] == str(volunteer_applicant.id)
    assert item["first_name"] == "Jane"
    assert item["last_name"] == "Doe"
    assert item["email"] == "volunteer@example.com"
    assert item["tshirt_size"] == "M"
    assert item["color"] == "#3B82F6"


# ═══════════════════════════════════════════════════════════════════════
# 2. UPDATE VOLUNTEER PROFILE
# ═══════════════════════════════════════════════════════════════════════


async def test_update_volunteer_profile(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    conference: Conference,
    volunteer_applicant: CFPApplicant,
    volunteer_profile: VolunteerProfile,
) -> None:
    """Updating a volunteer profile changes the specified fields."""
    response = await client.put(
        f"/api/v1/conferences/{conference.id}/volunteer-profiles/{volunteer_applicant.id}",
        json={
            "tshirt_size": "XL",
            "notes": "Updated notes",
            "color": "#EF4444",
        },
        headers=auth_headers(admin_token_volunteers),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["tshirt_size"] == "XL"
    assert data["notes"] == "Updated notes"
    assert data["color"] == "#EF4444"
    # Unchanged fields preserved
    assert data["emergency_contact_name"] == "John Doe"
    assert data["skills"] == ["languages", "customer service"]


async def test_update_volunteer_profile_auto_create(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    conference: Conference,
    volunteer_applicant: CFPApplicant,
) -> None:
    """Updating a profile for applicant without one auto-creates it."""
    response = await client.put(
        f"/api/v1/conferences/{conference.id}/volunteer-profiles/{volunteer_applicant.id}",
        json={"tshirt_size": "S", "color": "#10B981"},
        headers=auth_headers(admin_token_volunteers),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["tshirt_size"] == "S"
    assert data["color"] == "#10B981"
    assert data["applicant_id"] == str(volunteer_applicant.id)


async def test_update_profile_not_volunteer(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_with_volunteers_module: Tenant,
    tenant: Tenant,
    tenant_admin_user: User,
    admin_token_volunteers: str,
    conference: Conference,
    volunteer_role: UserRole,
) -> None:
    """Updating a profile for an applicant without Volunteer role fails."""
    # Create applicant without the volunteer role
    applicant = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email="non-volunteer@example.com",
        first_name="Not",
        last_name="Volunteer",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(applicant)
    await db_session.commit()

    response = await client.put(
        f"/api/v1/conferences/{conference.id}/volunteer-profiles/{applicant.id}",
        json={"tshirt_size": "M"},
        headers=auth_headers(admin_token_volunteers),
    )
    assert response.status_code == 404


async def test_update_profile_forbidden_for_regular_user(
    client: AsyncClient,
    tenant_with_volunteers_module: Tenant,
    regular_user: User,
    user_token_volunteers: str,
    conference: Conference,
    volunteer_applicant: CFPApplicant,
    volunteer_profile: VolunteerProfile,
) -> None:
    """Regular user cannot update a volunteer profile."""
    response = await client.put(
        f"/api/v1/conferences/{conference.id}/volunteer-profiles/{volunteer_applicant.id}",
        json={"tshirt_size": "XL"},
        headers=auth_headers(user_token_volunteers),
    )
    assert response.status_code == 403
