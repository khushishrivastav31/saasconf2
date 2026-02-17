"""Tests for the centralized conference helper functions."""

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
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.conference_helpers import check_conference_admin, get_conference_for_tenant
from app.core.exceptions import AuthorizationError, NotFoundError
from app.models.conference import Conference
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_conference_access import ConferenceAccessLevel, UserConferenceAccess


# ---------------------------------------------------------------------------
# get_conference_for_tenant
# ---------------------------------------------------------------------------


class TestGetConferenceForTenant:
    """Tests for get_conference_for_tenant()."""

    @pytest.mark.asyncio
    async def test_returns_conference_when_found(
        self, db_session: AsyncSession, conference: Conference, tenant: Tenant
    ):
        """Returns the conference when ID and tenant match."""
        result = await get_conference_for_tenant(db_session, conference.id, tenant.id)
        assert result.id == conference.id
        assert result.tenant_id == tenant.id

    @pytest.mark.asyncio
    async def test_raises_not_found_for_wrong_tenant(
        self, db_session: AsyncSession, conference: Conference
    ):
        """Raises NotFoundError when tenant_id doesn't match."""
        wrong_tenant_id = uuid.uuid4()
        with pytest.raises(NotFoundError, match="Conference not found"):
            await get_conference_for_tenant(db_session, conference.id, wrong_tenant_id)

    @pytest.mark.asyncio
    async def test_raises_not_found_for_nonexistent_conference(
        self, db_session: AsyncSession, tenant: Tenant
    ):
        """Raises NotFoundError when conference doesn't exist."""
        fake_id = uuid.uuid4()
        with pytest.raises(NotFoundError, match="Conference not found"):
            await get_conference_for_tenant(db_session, fake_id, tenant.id)

    @pytest.mark.asyncio
    async def test_tenant_isolation(self, db_session: AsyncSession, conference: Conference):
        """Conference belonging to tenant A is invisible to tenant B."""
        # Create a second tenant
        other_tenant = Tenant(
            id=uuid.uuid4(), name="Other Corp", slug=f"other-{uuid.uuid4().hex[:8]}", is_active=True
        )
        db_session.add(other_tenant)
        await db_session.commit()

        with pytest.raises(NotFoundError):
            await get_conference_for_tenant(db_session, conference.id, other_tenant.id)


# ---------------------------------------------------------------------------
# check_conference_admin
# ---------------------------------------------------------------------------


class TestCheckConferenceAdmin:
    """Tests for check_conference_admin()."""

    @pytest.mark.asyncio
    async def test_super_admin_passes(
        self, db_session: AsyncSession, conference: Conference, super_admin_user: User
    ):
        """Super admins always pass the check."""
        # Create a mock-like object matching the CurrentUserDep attrs
        class FakeUser:
            user_id = super_admin_user.id
            tenant_id = None
            is_super_admin = True
            is_tenant_admin = False

        # Should not raise
        await check_conference_admin(conference.id, FakeUser(), db_session)

    @pytest.mark.asyncio
    async def test_tenant_admin_passes(
        self, db_session: AsyncSession, conference: Conference, tenant_admin_user: User
    ):
        """Tenant admins always pass the check."""
        class FakeUser:
            user_id = tenant_admin_user.id
            tenant_id = tenant_admin_user.tenant_id
            is_super_admin = False
            is_tenant_admin = True

        await check_conference_admin(conference.id, FakeUser(), db_session)

    @pytest.mark.asyncio
    async def test_regular_user_without_access_fails(
        self, db_session: AsyncSession, conference: Conference, regular_user: User
    ):
        """Regular user without UserConferenceAccess raises AuthorizationError."""
        class FakeUser:
            user_id = regular_user.id
            tenant_id = regular_user.tenant_id
            is_super_admin = False
            is_tenant_admin = False

        with pytest.raises(AuthorizationError, match="Admin access"):
            await check_conference_admin(conference.id, FakeUser(), db_session)

    @pytest.mark.asyncio
    async def test_regular_user_with_admin_access_passes(
        self, db_session: AsyncSession, conference: Conference, regular_user: User
    ):
        """Regular user WITH admin access passes the check."""
        # Grant admin access
        access = UserConferenceAccess(
            id=uuid.uuid4(),
            user_id=regular_user.id,
            conference_id=conference.id,
            access_level=ConferenceAccessLevel.ADMIN.value,
        )
        db_session.add(access)
        await db_session.commit()

        class FakeUser:
            user_id = regular_user.id
            tenant_id = regular_user.tenant_id
            is_super_admin = False
            is_tenant_admin = False

        # Should not raise
        await check_conference_admin(conference.id, FakeUser(), db_session)

    @pytest.mark.asyncio
    async def test_regular_user_with_read_only_access_fails(
        self, db_session: AsyncSession, conference: Conference, regular_user: User
    ):
        """Regular user with only read_only access still fails the admin check."""
        access = UserConferenceAccess(
            id=uuid.uuid4(),
            user_id=regular_user.id,
            conference_id=conference.id,
            access_level=ConferenceAccessLevel.READ_ONLY.value,
        )
        db_session.add(access)
        await db_session.commit()

        class FakeUser:
            user_id = regular_user.id
            tenant_id = regular_user.tenant_id
            is_super_admin = False
            is_tenant_admin = False

        with pytest.raises(AuthorizationError, match="Admin access"):
            await check_conference_admin(conference.id, FakeUser(), db_session)
