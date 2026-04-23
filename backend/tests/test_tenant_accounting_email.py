"""Tests for ``tenants.accounting_email`` — the finance CC address.

Covers the column itself (migration landed, API reads/writes it) plus the
validation contract (invalid emails rejected). The invoice-send guard + CC
wiring lives in ``test_invoice_email_cc.py`` / ``test_training_invoice_email_cc.py``.
"""

import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import auth_headers

MY_COMPANY_URL = "/api/v1/my-company"


def _token(user: User) -> str:
    return create_access_token(
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        modules=["conferences"],
    )


@pytest_asyncio.fixture
async def ae_tenant(db_session: AsyncSession) -> Tenant:
    t = Tenant(id=uuid.uuid4(), name="AE Corp", slug=f"ae-{uuid.uuid4().hex[:8]}")
    db_session.add(t)
    await db_session.commit()
    return t


@pytest_asyncio.fixture
async def ae_admin(db_session: AsyncSession, ae_tenant: Tenant) -> User:
    u = User(
        id=uuid.uuid4(),
        tenant_id=ae_tenant.id,
        email=f"ae-admin-{uuid.uuid4().hex[:8]}@test.com",
        password_hash=hash_password("Password123!"),
        first_name="AE",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    db_session.add(u)
    await db_session.commit()
    return u


@pytest_asyncio.fixture
async def ae_tenant_with_modules(db_session: AsyncSession, ae_tenant: Tenant, conferences_module: Module) -> Tenant:
    tm = TenantModule(
        id=uuid.uuid4(),
        tenant_id=ae_tenant.id,
        module_id=conferences_module.id,
        is_enabled=True,
    )
    db_session.add(tm)
    await db_session.commit()
    return ae_tenant


@pytest.mark.asyncio
async def test_put_my_company_persists_accounting_email(
    client: AsyncClient,
    db_session: AsyncSession,
    ae_tenant_with_modules: Tenant,
    ae_admin: User,
) -> None:
    """PUT persists ``accounting_email``; subsequent GET returns it."""
    resp = await client.put(
        MY_COMPANY_URL,
        json={"accounting_email": "finance@example.com"},
        headers=auth_headers(_token(ae_admin)),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["accounting_email"] == "finance@example.com"

    get_resp = await client.get(MY_COMPANY_URL, headers=auth_headers(_token(ae_admin)))
    assert get_resp.status_code == 200
    assert get_resp.json()["accounting_email"] == "finance@example.com"


@pytest.mark.asyncio
async def test_put_my_company_invalid_email_rejected(
    client: AsyncClient,
    ae_tenant_with_modules: Tenant,
    ae_admin: User,
) -> None:
    """Pydantic ``EmailStr`` rejects malformed addresses with 422."""
    resp = await client.put(
        MY_COMPANY_URL,
        json={"accounting_email": "not-an-email"},
        headers=auth_headers(_token(ae_admin)),
    )
    assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_put_my_company_null_clears_accounting_email(
    client: AsyncClient,
    db_session: AsyncSession,
    ae_tenant_with_modules: Tenant,
    ae_admin: User,
) -> None:
    """Explicit null clears the field."""
    # First set it
    set_resp = await client.put(
        MY_COMPANY_URL,
        json={"accounting_email": "finance@example.com"},
        headers=auth_headers(_token(ae_admin)),
    )
    assert set_resp.status_code == 200

    # Then null it out
    clear_resp = await client.put(
        MY_COMPANY_URL,
        json={"accounting_email": None},
        headers=auth_headers(_token(ae_admin)),
    )
    assert clear_resp.status_code == 200, clear_resp.text
    assert clear_resp.json()["accounting_email"] is None
