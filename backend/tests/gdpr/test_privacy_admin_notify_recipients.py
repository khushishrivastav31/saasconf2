"""Tests for resolve_privacy_notify_recipients — the admin-user resolver
that feeds send_privacy_request_admin_notification.

RED phase: all tests fail until the resolver is implemented.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

from app.core.email.privacy import (
    resolve_privacy_notify_recipients,
    send_privacy_request_admin_notification,
)
from app.core.security import hash_password
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.user_tenant_role import TenantRoleLevel, TenantRoleScope, UserTenantRole

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


async def _make_tenant(db: AsyncSession, **kwargs: object) -> Tenant:
    tenant = Tenant(
        id=uuid.uuid4(),
        name="Test Corp",
        slug=f"tc-{uuid.uuid4().hex[:6]}",
        is_active=True,
        **kwargs,
    )
    db.add(tenant)
    await db.commit()
    return tenant


async def _make_admin_user(db: AsyncSession, tenant_id: uuid.UUID, email: str) -> User:
    user = User(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        email=email,
        password_hash=hash_password("Password123!"),
        first_name="Admin",
        last_name="User",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    db.add(user)
    await db.flush()
    role = UserTenantRole(
        user_id=user.id,
        scope=TenantRoleScope.ALL,
        level=TenantRoleLevel.ADMIN,
    )
    db.add(role)
    await db.commit()
    return user


# ---------------------------------------------------------------------------
# resolve_privacy_notify_recipients
# ---------------------------------------------------------------------------


class TestResolvePrivacyNotifyRecipients:
    @pytest.mark.asyncio
    async def test_returns_admin_users_when_contact_persons_empty(
        self, db_session: AsyncSession
    ) -> None:
        tenant = await _make_tenant(db_session, contact_persons=[])
        admin = await _make_admin_user(db_session, tenant.id, "admin@corp.test")

        recipients = await resolve_privacy_notify_recipients(db_session, tenant.id)

        assert admin.email in recipients

    @pytest.mark.asyncio
    async def test_unions_contact_person_and_admin_users(
        self, db_session: AsyncSession
    ) -> None:
        tenant = await _make_tenant(
            db_session,
            contact_persons=[{"name": "DPO", "email": "dpo@corp.test"}],
        )
        await _make_admin_user(db_session, tenant.id, "admin@corp.test")

        recipients = await resolve_privacy_notify_recipients(db_session, tenant.id)

        assert "dpo@corp.test" in recipients
        assert "admin@corp.test" in recipients

    @pytest.mark.asyncio
    async def test_deduplicates_when_admin_matches_contact_person(
        self, db_session: AsyncSession
    ) -> None:
        shared_email = "shared@corp.test"
        tenant = await _make_tenant(
            db_session,
            contact_persons=[{"name": "Admin", "email": shared_email}],
        )
        await _make_admin_user(db_session, tenant.id, shared_email)

        recipients = await resolve_privacy_notify_recipients(db_session, tenant.id)

        assert recipients.count(shared_email) == 1

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_admins_and_no_contact(
        self, db_session: AsyncSession
    ) -> None:
        tenant = await _make_tenant(db_session, contact_persons=[])

        recipients = await resolve_privacy_notify_recipients(db_session, tenant.id)

        assert recipients == []

    @pytest.mark.asyncio
    async def test_excludes_inactive_admin_users(
        self, db_session: AsyncSession
    ) -> None:
        tenant = await _make_tenant(db_session, contact_persons=[])
        user = User(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            email="inactive@corp.test",
            password_hash=hash_password("Password123!"),
            first_name="Old",
            last_name="Admin",
            role=UserRole.TENANT_ADMIN.value,
            is_active=False,
        )
        db_session.add(user)
        await db_session.flush()
        role = UserTenantRole(
            user_id=user.id,
            scope=TenantRoleScope.ALL,
            level=TenantRoleLevel.ADMIN,
        )
        db_session.add(role)
        await db_session.commit()

        recipients = await resolve_privacy_notify_recipients(db_session, tenant.id)

        assert recipients == []

    @pytest.mark.asyncio
    async def test_returns_empty_when_tenant_not_found(
        self, db_session: AsyncSession
    ) -> None:
        recipients = await resolve_privacy_notify_recipients(db_session, uuid.uuid4())
        assert recipients == []


# ---------------------------------------------------------------------------
# send_privacy_request_admin_notification (updated behaviour)
# ---------------------------------------------------------------------------


class TestAdminNotificationWithResolver:
    @pytest.mark.asyncio
    async def test_sends_to_admin_user_when_contact_persons_empty(
        self, db_session: AsyncSession
    ) -> None:
        tenant = await _make_tenant(db_session, contact_persons=[])
        await _make_admin_user(db_session, tenant.id, "admin@corp.test")

        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            ok = await send_privacy_request_admin_notification(
                db_session,
                tenant_id=tenant.id,
                request_type="erasure",
                subject_email="speaker@example.com",
                notes=None,
            )

        assert ok is True
        recipients = [call.args[0] for call in mock_send.await_args_list]
        assert "admin@corp.test" in recipients

    @pytest.mark.asyncio
    async def test_noop_when_no_admins_and_no_contact(
        self, db_session: AsyncSession
    ) -> None:
        tenant = await _make_tenant(db_session, contact_persons=[])

        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            ok = await send_privacy_request_admin_notification(
                db_session,
                tenant_id=tenant.id,
                request_type="erasure",
                subject_email="speaker@example.com",
                notes=None,
            )

        assert ok is False
        mock_send.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_email_cta_links_to_privacy_tab(
        self, db_session: AsyncSession
    ) -> None:
        tenant = await _make_tenant(
            db_session,
            contact_persons=[{"name": "DPO", "email": "dpo@corp.test"}],
        )

        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            await send_privacy_request_admin_notification(
                db_session,
                tenant_id=tenant.id,
                request_type="erasure",
                subject_email="speaker@example.com",
                notes=None,
            )

        html = mock_send.await_args.args[2]
        text = mock_send.await_args.args[3]
        assert "?tab=privacy" in html
        assert "?tab=privacy" in text
