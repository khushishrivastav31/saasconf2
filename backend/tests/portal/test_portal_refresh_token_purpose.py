"""Phase 1 RED — PortalRefreshToken.purpose column.

PortalRefreshToken currently has no `purpose` field. This test asserts the
column exists and correctly distinguishes:
  - 'setup'  — welcome-email first-time password setup (7-day expiry)
  - 'reset'  — forgot-password reset (1-hour expiry)
  - None     — legacy session refresh tokens (backwards compat, no purpose set)

Run this test BEFORE adding the column to confirm it fails for the right
reason (AttributeError or DB column-not-found), then add the column + migration
to make it green.
"""

import uuid
from datetime import timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.pii_crypto import encrypt_pii, hash_email
from app.core.utils import utcnow
from app.models.portal_user import PortalRefreshToken, PortalUser
from app.models.tenant import Tenant


async def _make_portal_user(db: AsyncSession, tenant: Tenant) -> PortalUser:
    user = PortalUser(
        tenant_id=tenant.id,
        email_encrypted=encrypt_pii(f"purpose-test-{uuid.uuid4().hex[:8]}@example.com"),
        email_hash=hash_email(f"purpose-test-{uuid.uuid4().hex[:8]}@example.com"),
        first_name="Purpose",
        last_name="Test",
    )
    db.add(user)
    await db.flush()
    return user


@pytest.mark.asyncio
class TestPortalRefreshTokenPurpose:
    """PortalRefreshToken.purpose must exist and accept 'setup', 'reset', and None."""

    async def test_purpose_setup_is_stored(self, db_session: AsyncSession, tenant: Tenant) -> None:
        """A token created with purpose='setup' must round-trip through the DB."""
        user = await _make_portal_user(db_session, tenant)

        token = PortalRefreshToken(
            portal_user_id=user.id,
            token_hash="aaaa" * 16,
            expires_at=utcnow() + timedelta(days=7),
            purpose="setup",
        )
        db_session.add(token)
        await db_session.flush()
        await db_session.refresh(token)

        assert token.purpose == "setup"

    async def test_purpose_reset_is_stored(self, db_session: AsyncSession, tenant: Tenant) -> None:
        """A token created with purpose='reset' must round-trip through the DB."""
        user = await _make_portal_user(db_session, tenant)

        token = PortalRefreshToken(
            portal_user_id=user.id,
            token_hash="bbbb" * 16,
            expires_at=utcnow() + timedelta(hours=1),
            purpose="reset",
        )
        db_session.add(token)
        await db_session.flush()
        await db_session.refresh(token)

        assert token.purpose == "reset"

    async def test_purpose_defaults_to_none_for_backwards_compat(
        self, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """Tokens created without purpose (legacy session refresh tokens) must store NULL.

        Existing rows in the DB have no purpose — nullable preserves them without
        a data migration.
        """
        user = await _make_portal_user(db_session, tenant)

        token = PortalRefreshToken(
            portal_user_id=user.id,
            token_hash="cccc" * 16,
            expires_at=utcnow() + timedelta(days=30),
        )
        db_session.add(token)
        await db_session.flush()
        await db_session.refresh(token)

        assert token.purpose is None

    async def test_setup_token_is_queryable_by_purpose(
        self, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """A setup token can be found by filtering on purpose='setup'.

        This mirrors what the setup-password endpoint will do: look up the token
        by hash AND require purpose='setup' so a reset token can't be used to
        set up a new account and vice-versa.
        """
        from sqlalchemy import select

        user = await _make_portal_user(db_session, tenant)
        raw_hash = "dddd" * 16

        db_session.add(
            PortalRefreshToken(
                portal_user_id=user.id,
                token_hash=raw_hash,
                expires_at=utcnow() + timedelta(days=7),
                purpose="setup",
            )
        )
        # Also add a reset token with the same user so we confirm purpose filters
        db_session.add(
            PortalRefreshToken(
                portal_user_id=user.id,
                token_hash="eeee" * 16,
                expires_at=utcnow() + timedelta(hours=1),
                purpose="reset",
            )
        )
        await db_session.flush()

        result = await db_session.execute(
            select(PortalRefreshToken).where(
                PortalRefreshToken.portal_user_id == user.id,
                PortalRefreshToken.token_hash == raw_hash,
                PortalRefreshToken.purpose == "setup",
                PortalRefreshToken.expires_at > utcnow(),
            )
        )
        found = result.scalar_one_or_none()
        assert found is not None, "setup token not found when filtering by purpose='setup'"
        assert found.purpose == "setup"
