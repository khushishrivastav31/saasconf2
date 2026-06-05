"""Regression tests for verify-email race condition.

Guards against UniqueViolationError on ix_portal_users_tenant_email_hash when:
 - Two concurrent verify-email requests arrive for the same new CFP applicant.
 - The applicant's email already has a portal_user (e.g. from a prior
   conference / training registration).

Uses ``legacy_truncate`` because both scenarios need committed rows visible
across independent sessions — savepoint isolation can't simulate this.
"""

import os
import uuid

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://saasconf:saasconf_dev_password@localhost:5432/saasconf_test",
)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-unit-tests-minimum-32-chars")
os.environ.setdefault("SUPER_ADMIN_PASSWORD", "testpassword123")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/1")

import asyncio

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.applicant_security import generate_email_verification_token
from app.core.security import hash_password
from app.core.security.pii_crypto import encrypt_pii, hash_email
from app.core.utils import utcnow
from app.models.applicant_token import ApplicantEmailVerification
from app.models.cfp_applicants import CFPApplicant
from app.models.portal_user import PortalUser
from app.models.tenant import Tenant
from tests.conftest import RLS_BYPASS, TestSessionLocal


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _email(suffix: str) -> str:
    return f"verify-race-{suffix}-{uuid.uuid4().hex[:6]}@example.com"


async def _seed_applicant_with_token(tenant: Tenant, email: str) -> str:
    """Commit a CFPApplicant + verification token; return the raw token."""
    async with TestSessionLocal() as db:
        await db.execute(RLS_BYPASS)
        applicant = CFPApplicant(
            tenant_id=tenant.id,
            first_name="Test",
            last_name="User",
            email=email,
            password_hash=hash_password("Password123!"),
        )
        db.add(applicant)
        await db.flush()

        raw_token, token_hash = generate_email_verification_token()
        db.add(
            ApplicantEmailVerification(
                applicant_id=applicant.id,
                token_hash=token_hash,
                expires_at=utcnow().replace(year=utcnow().year + 1),
            )
        )
        await db.commit()
    return raw_token


async def _seed_portal_user(tenant: Tenant, email: str) -> PortalUser:
    """Commit a PortalUser for the given email and return it."""
    async with TestSessionLocal() as db:
        await db.execute(RLS_BYPASS)
        portal_user = PortalUser(
            tenant_id=tenant.id,
            email_encrypted=encrypt_pii(email),
            email_hash=hash_email(email),
            first_name="Prior",
            last_name="User",
            is_active=True,
        )
        db.add(portal_user)
        await db.commit()
        await db.refresh(portal_user)
    return portal_user


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.legacy_truncate
async def test_verify_email_links_existing_portal_user(
    client: AsyncClient,
    tenant: Tenant,
) -> None:
    """When a portal_user already exists for the email (e.g. from a prior
    conference / training registration), verify-email must link to it without
    raising a UniqueViolationError."""
    email = _email("existing-portal")

    existing = await _seed_portal_user(tenant, email)
    raw_token = await _seed_applicant_with_token(tenant, email)

    resp = await client.post(
        f"/api/v1/portal/{tenant.slug}/verify-email",
        json={"token": raw_token},
    )
    assert resp.status_code == 200, resp.text

    # Verify the applicant was linked to the pre-existing portal_user
    async with TestSessionLocal() as fresh:
        await fresh.execute(RLS_BYPASS)
        result = await fresh.execute(
            select(CFPApplicant).where(
                CFPApplicant.tenant_id == tenant.id,
                CFPApplicant.email_hash == hash_email(email),
            )
        )
        applicant = result.scalar_one_or_none()
        assert applicant is not None
        assert applicant.portal_user_id == existing.id


@pytest.mark.legacy_truncate
async def test_verify_email_concurrent_requests(
    client: AsyncClient,
    tenant: Tenant,
) -> None:
    """Two simultaneous verify-email calls must not produce a 500 — at least
    one must return 200 and the other at most 400 (token already used)."""
    email = _email("concurrent")
    raw_token = await _seed_applicant_with_token(tenant, email)

    url = f"/api/v1/portal/{tenant.slug}/verify-email"
    payload = {"token": raw_token}

    results = await asyncio.gather(
        client.post(url, json=payload),
        client.post(url, json=payload),
        return_exceptions=True,
    )

    statuses = [r.status_code for r in results if hasattr(r, "status_code")]
    assert 200 in statuses, f"Expected at least one 200, got: {statuses}"
    assert all(s < 500 for s in statuses), f"Got a 5xx: {statuses}"
