"""Tests: CFP applicant profile update — all profile fields round-trip via PUT."""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.cfp_applicants import CFPApplicant
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User
from tests.conftest import _make_token, auth_headers

CFP_APPLICANTS_URL = "/api/v1/cfp/applicants"


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="CFP", code="cfp", description="Call for Papers", is_active=True)
    db_session.add(m)
    await db_session.commit()
    return m


@pytest_asyncio.fixture()
async def conferences_module(db_session: AsyncSession) -> Module:
    m = Module(id=uuid.uuid4(), name="Conferences", code="conferences", description="Conferences", is_active=True)
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
    for mod in [conferences_module, cfp_module]:
        db_session.add(TenantModule(id=uuid.uuid4(), tenant_id=tenant.id, module_id=mod.id, is_enabled=True))
    await db_session.commit()
    return tenant


@pytest.fixture()
def tenant_admin_token(tenant_admin_user: User) -> str:
    """Override global token — CFP endpoints require both 'cfp' and 'conferences' modules."""
    return _make_token(tenant_admin_user, modules=["cfp", "conferences"])


@pytest_asyncio.fixture()
async def applicant(db_session: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Jane",
        last_name="Speaker",
        email=f"jane-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        bio="Original bio",
        city="Paris",
    )
    db_session.add(a)
    await db_session.commit()
    return a


async def test_applicant_bio_persists(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
    tenant_with_cfp: Tenant,
    applicant: CFPApplicant,
) -> None:
    """PUT bio → response reflects the updated value; list endpoint confirms persistence."""
    resp = await client.put(
        f"{CFP_APPLICANTS_URL}/{applicant.id}",
        json={"bio": "Updated speaker bio"},
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["bio"] == "Updated speaker bio"

    # Confirm persistence via list endpoint
    list_resp = await client.get(CFP_APPLICANTS_URL, headers=auth_headers(tenant_admin_token))
    assert list_resp.status_code == 200
    items = list_resp.json()["items"]
    match = next((a for a in items if a["id"] == str(applicant.id)), None)
    assert match is not None
    assert match["bio"] == "Updated speaker bio"


async def test_applicant_address_fields_persist(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
    tenant_with_cfp: Tenant,
    applicant: CFPApplicant,
) -> None:
    """PUT address fields → response and fresh GET both reflect the new values."""
    resp = await client.put(
        f"{CFP_APPLICANTS_URL}/{applicant.id}",
        json={
            "address_line_1": "1 Speaker Lane",
            "city": "Berlin",
            "postal_code": "10115",
            "country": "DE",
        },
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["address_line_1"] == "1 Speaker Lane"
    assert data["city"] == "Berlin"
    assert data["postal_code"] == "10115"
    assert data["country"] == "DE"

    # Confirm via list endpoint
    list_resp = await client.get(CFP_APPLICANTS_URL, headers=auth_headers(tenant_admin_token))
    items = list_resp.json()["items"]
    match = next((a for a in items if a["id"] == str(applicant.id)), None)
    assert match is not None
    assert match["address_line_1"] == "1 Speaker Lane"
    assert match["city"] == "Berlin"


async def test_applicant_partial_update_does_not_clear_existing_fields(
    client: AsyncClient,
    tenant: Tenant,
    tenant_admin_user: User,
    tenant_admin_token: str,
    tenant_with_cfp: Tenant,
    applicant: CFPApplicant,
) -> None:
    """Updating only bio leaves city untouched."""
    resp = await client.put(
        f"{CFP_APPLICANTS_URL}/{applicant.id}",
        json={"bio": "Fresh bio only"},
        headers=auth_headers(tenant_admin_token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["bio"] == "Fresh bio only"
    assert data["city"] == "Paris"
