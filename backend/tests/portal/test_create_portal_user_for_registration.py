"""Phase 2 RED — create_portal_user_for_registration().

The current create_user_for_registration() (user_auto_creation.py) creates a
User row (admin table) + UserPasswordReset.  The spec requires a PortalUser row
+ PortalRefreshToken(purpose='setup').

Run this test BEFORE writing the function to confirm it fails with ImportError
or AttributeError, then implement create_portal_user_for_registration() to make
it green.

Scenarios covered:
  1. New attendee → PortalUser created, PortalRefreshToken(purpose='setup', 7 days)
  2. Existing PortalUser with password → existing user returned, no new token
  3. Existing PortalUser without password → existing user returned, fresh setup token
  4. No email on registration → (None, None) returned, nothing created
"""

import types
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.core.security.pii_crypto import encrypt_pii, hash_email
from app.core.utils import utcnow
from app.models.portal_user import PortalRefreshToken, PortalUser
from app.models.tenant import Tenant

# This import is the RED line — the module does not exist yet.
from app.core.portal_user_auto_creation import create_portal_user_for_registration


def _make_registration(tenant_id: uuid.UUID, email: str | None = None) -> types.SimpleNamespace:
    """Stub with only the fields create_portal_user_for_registration reads."""
    return types.SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        first_name="Jane",
        last_name="Attendee",
        email=email or f"jane-{uuid.uuid4().hex[:8]}@example.com",
    )


@pytest.mark.asyncio
class TestCreatePortalUserForRegistration:

    async def test_new_attendee_creates_portal_user(
        self, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """A brand-new email creates a PortalUser row (not a User/admin row)."""
        from app.models.user import User

        reg = _make_registration(tenant.id)

        portal_user, raw_token = await create_portal_user_for_registration(
            db=db_session,
            tenant_id=tenant.id,
            registration=reg,
        )

        assert portal_user is not None
        assert isinstance(portal_user, PortalUser)
        assert portal_user.id is not None
        assert portal_user.tenant_id == tenant.id
        assert portal_user.email_hash == hash_email(reg.email)

        # Must NOT create an admin User row
        result = await db_session.execute(
            select(User).where(User.email_hash == hash_email(reg.email))
        )
        assert result.scalar_one_or_none() is None, "Should not create an admin User row"

    async def test_new_attendee_gets_setup_token(
        self, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """New attendee gets a PortalRefreshToken with purpose='setup' valid for 7 days."""
        reg = _make_registration(tenant.id)

        portal_user, raw_token = await create_portal_user_for_registration(
            db=db_session,
            tenant_id=tenant.id,
            registration=reg,
        )

        assert raw_token is not None, "Expected a raw setup token for a new attendee"

        # Verify the token row in the DB
        result = await db_session.execute(
            select(PortalRefreshToken).where(
                PortalRefreshToken.portal_user_id == portal_user.id,
                PortalRefreshToken.purpose == "setup",
            )
        )
        token_row = result.scalar_one_or_none()
        assert token_row is not None, "PortalRefreshToken(purpose='setup') not found"

        seven_days_from_now = utcnow() + timedelta(days=7)
        # Allow a small clock delta
        assert token_row.expires_at <= seven_days_from_now + timedelta(seconds=5)
        assert token_row.expires_at >= utcnow() + timedelta(days=6, hours=23)

    async def test_existing_portal_user_with_password_no_duplicate_no_token(
        self, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """Existing PortalUser who already set a password → no duplicate, no new token."""
        email = f"returning-{uuid.uuid4().hex[:8]}@example.com"
        existing = PortalUser(
            tenant_id=tenant.id,
            email_encrypted=encrypt_pii(email),
            email_hash=hash_email(email),
            password_hash=hash_password("SomeP@ssword1!"),
            first_name="Jane",
            last_name="Returning",
        )
        db_session.add(existing)
        await db_session.flush()

        reg = _make_registration(tenant.id, email=email)

        portal_user, raw_token = await create_portal_user_for_registration(
            db=db_session,
            tenant_id=tenant.id,
            registration=reg,
        )

        assert portal_user.id == existing.id, "Should return the existing PortalUser"
        assert raw_token is None, "Should not issue a new setup token when password already set"

        # Only one PortalUser row
        result = await db_session.execute(
            select(PortalUser).where(PortalUser.email_hash == hash_email(email))
        )
        rows = result.scalars().all()
        assert len(rows) == 1

    async def test_existing_portal_user_without_password_gets_fresh_token(
        self, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """Existing PortalUser who never set a password gets a fresh setup token."""
        email = f"nopass-{uuid.uuid4().hex[:8]}@example.com"
        existing = PortalUser(
            tenant_id=tenant.id,
            email_encrypted=encrypt_pii(email),
            email_hash=hash_email(email),
            password_hash=None,
            first_name="Jane",
            last_name="NoPass",
        )
        db_session.add(existing)
        await db_session.flush()

        reg = _make_registration(tenant.id, email=email)

        portal_user, raw_token = await create_portal_user_for_registration(
            db=db_session,
            tenant_id=tenant.id,
            registration=reg,
        )

        assert portal_user.id == existing.id
        assert raw_token is not None, "Should issue a fresh setup token when no password set"

        result = await db_session.execute(
            select(PortalRefreshToken).where(
                PortalRefreshToken.portal_user_id == existing.id,
                PortalRefreshToken.purpose == "setup",
            )
        )
        token_row = result.scalar_one_or_none()
        assert token_row is not None

    async def test_no_email_returns_none_none(
        self, db_session: AsyncSession, tenant: Tenant
    ) -> None:
        """Registration with no email returns (None, None) and creates nothing."""
        reg = _make_registration(tenant.id, email=None)
        reg.email = None  # type: ignore[assignment]

        portal_user, raw_token = await create_portal_user_for_registration(
            db=db_session,
            tenant_id=tenant.id,
            registration=reg,
        )

        assert portal_user is None
        assert raw_token is None
