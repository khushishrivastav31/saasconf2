"""Tests for POST /cfp/pending-verifications/{applicant_id}/resend
and POST /cfp/pending-verifications/resend-all."""

import os
import uuid

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.core.utils import utcnow
from app.models.cfp_applicants import CFPApplicant
from app.models.module import Module, TenantModule
from app.models.tenant import Tenant
from tests.conftest import _make_token, auth_headers

CFP_BASE = "/api/v1/cfp"
RESEND_URL = CFP_BASE + "/pending-verifications/{applicant_id}/resend"
RESEND_ALL_URL = CFP_BASE + "/pending-verifications/resend-all"


# ── Local fixtures ────────────────────────────────────────────────────────


@pytest_asyncio.fixture()
async def cfp_module(db_session: AsyncSession) -> Module:
    m = Module(
        id=uuid.uuid4(),
        name="CFP",
        code="cfp",
        description="Call for Papers",
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
    for mod in [conferences_module, cfp_module]:
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


async def _make_unverified(db: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Unverified",
        last_name="User",
        email=f"unverified-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("SecurePass1"),
        email_verified_at=None,
    )
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return a


async def _make_verified(db: AsyncSession, tenant: Tenant) -> CFPApplicant:
    a = CFPApplicant(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        first_name="Verified",
        last_name="User",
        email=f"verified-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("SecurePass1"),
        email_verified_at=utcnow(),
    )
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return a


def _admin_token(tenant_admin_user) -> str:
    return _make_token(tenant_admin_user, modules=["conferences", "cfp"])


# ── Tests: single resend ──────────────────────────────────────────────────


@pytest.mark.asyncio
class TestResendVerification:
    async def test_happy_path_returns_200(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant_admin_user,
    ) -> None:
        applicant = await _make_unverified(db_session, tenant_with_cfp)
        token = _admin_token(tenant_admin_user)
        url = RESEND_URL.format(applicant_id=applicant.id)

        resp = await client.post(url, headers=auth_headers(token))

        assert resp.status_code == 200
        body = resp.json()
        assert "message" in body
        assert "resent" in body["message"].lower()

    async def test_unknown_applicant_returns_404(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user,
    ) -> None:
        token = _admin_token(tenant_admin_user)
        url = RESEND_URL.format(applicant_id=uuid.uuid4())

        resp = await client.post(url, headers=auth_headers(token))

        assert resp.status_code == 404

    async def test_wrong_tenant_applicant_returns_404(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant_admin_user,
    ) -> None:
        other_tenant = Tenant(
            id=uuid.uuid4(),
            name="Other Tenant",
            slug=f"other-{uuid.uuid4().hex[:8]}",
            is_active=True,
        )
        db_session.add(other_tenant)
        await db_session.commit()

        applicant = await _make_unverified(db_session, other_tenant)
        token = _admin_token(tenant_admin_user)
        url = RESEND_URL.format(applicant_id=applicant.id)

        resp = await client.post(url, headers=auth_headers(token))

        assert resp.status_code == 404

    async def test_already_verified_applicant_returns_404(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant_admin_user,
    ) -> None:
        applicant = await _make_verified(db_session, tenant_with_cfp)
        token = _admin_token(tenant_admin_user)
        url = RESEND_URL.format(applicant_id=applicant.id)

        resp = await client.post(url, headers=auth_headers(token))

        assert resp.status_code == 404

    async def test_unauthenticated_returns_401(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
    ) -> None:
        applicant = await _make_unverified(db_session, tenant_with_cfp)
        url = RESEND_URL.format(applicant_id=applicant.id)

        resp = await client.post(url)

        assert resp.status_code == 401


# ── Tests: resend all ─────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestResendAllVerifications:
    async def test_resend_all_returns_sent_count(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        tenant_with_cfp: Tenant,
        tenant_admin_user,
    ) -> None:
        await _make_unverified(db_session, tenant_with_cfp)
        await _make_unverified(db_session, tenant_with_cfp)
        token = _admin_token(tenant_admin_user)

        resp = await client.post(RESEND_ALL_URL, headers=auth_headers(token))

        assert resp.status_code == 200
        body = resp.json()
        assert body["sent"] >= 2
        assert body["failed"] == 0

    async def test_resend_all_empty_returns_zeros(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
        tenant_admin_user,
    ) -> None:
        token = _admin_token(tenant_admin_user)

        resp = await client.post(RESEND_ALL_URL, headers=auth_headers(token))

        assert resp.status_code == 200
        body = resp.json()
        assert body["sent"] == 0
        assert body["failed"] == 0

    async def test_resend_all_unauthenticated_returns_401(
        self,
        client: AsyncClient,
        tenant_with_cfp: Tenant,
    ) -> None:
        resp = await client.post(RESEND_ALL_URL)

        assert resp.status_code == 401
