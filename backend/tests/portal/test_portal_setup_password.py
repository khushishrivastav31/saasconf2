"""Phase 4 RED — POST /portal/{tenant_slug}/unified/setup-password endpoint.

The setup-password endpoint lets a new attendee set their password using the
PortalRefreshToken(purpose='setup') that was issued at registration time.

It is distinct from reset-password:
  - Only accepts tokens with purpose='setup'
  - A purpose='reset' token must be rejected with 400

Run before adding the endpoint to confirm all tests fail with 404 (route not found).

Scenarios:
  1. Happy path: valid setup token → 200, PortalUser.password_hash set, token deleted
  2. Expired token → 400
  3. Already-consumed token (re-submission) → 400
  4. Token with purpose='reset' submitted here → 400
  5. Valid token but wrong tenant → 404
"""

import hashlib
import uuid
from datetime import timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import generate_email_verification_token
from app.core.security.pii_crypto import encrypt_pii, hash_email
from app.core.utils import utcnow
from app.models.portal_user import PortalRefreshToken, PortalUser
from app.models.tenant import Tenant


# ── Fixtures ─────────────────────────────────────────────────────────────────


async def _make_portal_user(db: AsyncSession, tenant: Tenant, *, password_hash: str | None = None) -> PortalUser:
    email = f"setup-{uuid.uuid4().hex[:8]}@example.com"
    user = PortalUser(
        tenant_id=tenant.id,
        email_encrypted=encrypt_pii(email),
        email_hash=hash_email(email),
        first_name="Jane",
        last_name="Attendee",
        password_hash=password_hash,
    )
    db.add(user)
    await db.flush()
    return user


async def _make_setup_token(
    db: AsyncSession,
    portal_user: PortalUser,
    *,
    purpose: str = "setup",
    expires_at=None,
) -> tuple[str, PortalRefreshToken]:
    """Return (raw_token, token_row)."""
    raw_token, token_hash = generate_email_verification_token()
    token = PortalRefreshToken(
        portal_user_id=portal_user.id,
        token_hash=token_hash,
        expires_at=expires_at or utcnow() + timedelta(days=7),
        purpose=purpose,
    )
    db.add(token)
    await db.flush()
    return raw_token, token


# ── Tests ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_setup_password_happy_path(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    """Valid setup token → 200, password set, token deleted."""
    user = await _make_portal_user(db_session, tenant)
    raw_token, token_row = await _make_setup_token(db_session, user)
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/portal/{tenant.slug}/unified/setup-password",
        json={"token": raw_token, "password": "NewStr0ng!Pass"},
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "message" in data

    # Password must be set on the PortalUser
    await db_session.refresh(user)
    assert user.password_hash is not None

    # Token must be deleted (consumed)
    token_result = await db_session.execute(
        select(PortalRefreshToken).where(PortalRefreshToken.id == token_row.id)
    )
    assert token_result.scalar_one_or_none() is None, "Setup token should be deleted after use"


@pytest.mark.asyncio
async def test_setup_password_expired_token(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    """Expired setup token → 400."""
    user = await _make_portal_user(db_session, tenant)
    raw_token, _ = await _make_setup_token(
        db_session, user, expires_at=utcnow() - timedelta(hours=1)
    )
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/portal/{tenant.slug}/unified/setup-password",
        json={"token": raw_token, "password": "NewStr0ng!Pass"},
    )

    assert resp.status_code == 400, resp.text


@pytest.mark.asyncio
async def test_setup_password_consumed_token(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    """Re-submitting a token that was already consumed → 400."""
    user = await _make_portal_user(db_session, tenant)
    raw_token, _ = await _make_setup_token(db_session, user)
    await db_session.commit()

    # First use — succeeds
    resp1 = await client.post(
        f"/api/v1/portal/{tenant.slug}/unified/setup-password",
        json={"token": raw_token, "password": "NewStr0ng!Pass"},
    )
    assert resp1.status_code == 200

    # Second use — token is gone, must fail
    resp2 = await client.post(
        f"/api/v1/portal/{tenant.slug}/unified/setup-password",
        json={"token": raw_token, "password": "AnotherPass1!"},
    )
    assert resp2.status_code == 400, resp2.text


@pytest.mark.asyncio
async def test_setup_password_rejects_reset_purpose_token(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    """A token with purpose='reset' must be rejected by the setup endpoint."""
    user = await _make_portal_user(db_session, tenant)
    raw_token, _ = await _make_setup_token(db_session, user, purpose="reset")
    await db_session.commit()

    resp = await client.post(
        f"/api/v1/portal/{tenant.slug}/unified/setup-password",
        json={"token": raw_token, "password": "NewStr0ng!Pass"},
    )

    assert resp.status_code == 400, (
        f"Expected 400 for purpose='reset' token on setup endpoint, got {resp.status_code}"
    )


@pytest.mark.asyncio
async def test_setup_password_wrong_tenant(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant: Tenant,
) -> None:
    """Valid token but non-existent tenant slug → 404."""
    user = await _make_portal_user(db_session, tenant)
    raw_token, _ = await _make_setup_token(db_session, user)
    await db_session.commit()

    resp = await client.post(
        "/api/v1/portal/no-such-tenant/unified/setup-password",
        json={"token": raw_token, "password": "NewStr0ng!Pass"},
    )

    assert resp.status_code == 404, resp.text
