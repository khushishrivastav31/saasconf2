"""Tests for system lists, dynamic recipient lists, and extended bulk send.

Covers:
- System lists endpoint (user roles, sponsors, registrations)
- Dynamic list CRUD (create, read, update, delete)
- Dynamic list preview
- Bulk send with user_role_id, all_registrations, all_sponsors, dynamic_list_id
- Recipient count endpoint
- Template variable substitution with new variables
"""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.booking import BookingOption
from app.models.cfp import CFPApplicant
from app.models.conference import Conference
from app.models.module import Module, TenantModule
from app.models.registration import BillingProfile, Registration
from app.models.settings import SponsorPackage, UserRole, UserRoleAssignment
from app.models.sponsor import Sponsor
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import auth_headers


def _make_token(user: User, modules: list[str] | None = None) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=modules or [],
    )


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
    m = Module(
        id=uuid.uuid4(),
        name="Call for Papers",
        code="cfp",
        description="CFP",
        is_active=True,
    )
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def tenant_with_cfp(
    db_session: AsyncSession,
    tenant: Tenant,
    conferences_module: Module,
    cfp_module: Module,
) -> Tenant:
    for mod in (conferences_module, cfp_module):
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


@pytest_asyncio.fixture()
async def admin_token(tenant_admin_user: User) -> str:
    return _make_token(tenant_admin_user, modules=["conferences", "cfp"])


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Alice",
        last_name="Speaker",
        email=f"alice-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
    )
    db_session.add(a)
    await db_session.commit()
    return a


@pytest_asyncio.fixture()
async def user_role_with_assignment(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
    applicant: CFPApplicant,
) -> UserRole:
    """Create a user role with one assignment."""
    role = UserRole(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Speakers",
        description="Conference speakers",
    )
    db_session.add(role)
    await db_session.flush()

    assignment = UserRoleAssignment(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        user_role_id=role.id,
        applicant_id=applicant.id,
    )
    db_session.add(assignment)
    await db_session.commit()
    return role


@pytest_asyncio.fixture()
async def registration(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> Registration:
    bo = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Standard",
    )
    db_session.add(bo)

    bp = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="Test St 1",
        postal_code="10115",
        city="Berlin",
        country="DE",
        contact_first_name="Bob",
        contact_last_name="Attendee",
        contact_phone="+49123456",
        contact_email=f"bob-bp-{uuid.uuid4().hex[:8]}@example.com",
    )
    db_session.add(bp)
    await db_session.flush()

    reg = Registration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        billing_profile_id=bp.id,
        booking_option_id=bo.id,
        first_name="Bob",
        last_name="Attendee",
        email=f"bob-{uuid.uuid4().hex[:8]}@example.com",
        status="confirmed",
        registration_mode="individual",
    )
    db_session.add(reg)
    await db_session.commit()
    return reg


@pytest_asyncio.fixture()
async def sponsor_with_contact(
    db_session: AsyncSession,
    tenant: Tenant,
    conference: Conference,
) -> Sponsor:
    pkg = SponsorPackage(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Gold",
        price=1000,
    )
    db_session.add(pkg)
    await db_session.flush()

    sponsor = Sponsor(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        company_name="Acme Corp",
        sponsor_package_id=pkg.id,
        is_active=True,
        contact_persons=[{"name": "Carol Contact", "email": f"carol-{uuid.uuid4().hex[:8]}@acme.com"}],
    )
    db_session.add(sponsor)
    await db_session.commit()
    return sponsor


# ── System Lists ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_system_lists_returns_groups(
    client: AsyncClient,
    tenant_with_cfp: Tenant,
    conference: Conference,
    admin_token: str,
    user_role_with_assignment: UserRole,
    registration: Registration,
    sponsor_with_contact: Sponsor,
):
    resp = await client.get(
        f"/api/v1/conferences/{conference.id}/messaging/system-lists",
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200
    groups = resp.json()
    assert isinstance(groups, list)
    assert len(groups) >= 3  # at least user_role, registration, sponsor entries

    keys = {g["key"] for g in groups}
    assert f"user_role:{user_role_with_assignment.id}" in keys
    assert "all_registrations" in keys
    assert "all_sponsors" in keys


@pytest.mark.asyncio
async def test_system_lists_preview(
    client: AsyncClient,
    tenant_with_cfp: Tenant,
    conference: Conference,
    admin_token: str,
    registration: Registration,
):
    resp = await client.get(
        f"/api/v1/conferences/{conference.id}/messaging/system-lists/all_registrations/preview",
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1
    assert data["items"][0]["source"] == "registration"


# ── Dynamic Lists CRUD ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_dynamic_list_crud(
    client: AsyncClient,
    tenant_with_cfp: Tenant,
    conference: Conference,
    admin_token: str,
    registration: Registration,
):
    base = f"/api/v1/conferences/{conference.id}/messaging/dynamic-lists"
    headers = auth_headers(admin_token)

    # Create
    resp = await client.post(
        base,
        json={
            "name": "Test DL",
            "description": "test desc",
            "target_type": "registration",
            "filters": {},
        },
        headers=headers,
    )
    assert resp.status_code == 201
    dl = resp.json()
    dl_id = dl["id"]
    assert dl["name"] == "Test DL"
    assert dl["target_type"] == "registration"
    assert dl["recipient_count"] >= 1

    # List
    resp = await client.get(base, headers=headers)
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert any(i["id"] == dl_id for i in items)

    # Get
    resp = await client.get(f"{base}/{dl_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == dl_id

    # Update
    resp = await client.put(
        f"{base}/{dl_id}",
        json={"name": "Updated DL", "description": "new desc"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated DL"

    # Preview
    resp = await client.get(f"{base}/{dl_id}/preview", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1

    # Delete
    resp = await client.delete(f"{base}/{dl_id}", headers=headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_dynamic_list_duplicate_name_rejected(
    client: AsyncClient,
    tenant_with_cfp: Tenant,
    conference: Conference,
    admin_token: str,
):
    base = f"/api/v1/conferences/{conference.id}/messaging/dynamic-lists"
    headers = auth_headers(admin_token)

    resp1 = await client.post(
        base,
        json={"name": "Unique Name", "target_type": "registration", "filters": {}},
        headers=headers,
    )
    assert resp1.status_code == 201, f"Got {resp1.status_code}: {resp1.text}"

    resp = await client.post(
        base,
        json={"name": "Unique Name", "target_type": "registration", "filters": {}},
        headers=headers,
    )
    assert resp.status_code == 400


# ── Recipient Count Endpoint ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_recipient_count_all_registrations(
    client: AsyncClient,
    tenant_with_cfp: Tenant,
    conference: Conference,
    admin_token: str,
    registration: Registration,
):
    resp = await client.post(
        f"/api/v1/conferences/{conference.id}/messaging/recipient-count",
        json={"all_registrations": True},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_recipient_count_all_sponsors(
    client: AsyncClient,
    tenant_with_cfp: Tenant,
    conference: Conference,
    admin_token: str,
    sponsor_with_contact: Sponsor,
):
    resp = await client.post(
        f"/api/v1/conferences/{conference.id}/messaging/recipient-count",
        json={"all_sponsors": True},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


# ── Template Variable Substitution ────────────────────────────────────


def test_substitute_template_variables_new_tokens():
    from app.api.v1.messaging._shared import substitute_template_variables

    result = substitute_template_variables(
        "Hello [First Name] from [Company Name], option: [Booking Option]",
        first_name="Alice",
        company_name="Acme",
        booking_option="Gold Pass",
    )
    assert "Alice" in result
    assert "Acme" in result
    assert "Gold Pass" in result
    assert "[Company Name]" not in result
    assert "[Booking Option]" not in result
