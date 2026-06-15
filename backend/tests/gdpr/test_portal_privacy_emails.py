"""Email notifications fired when a portal user files a privacy request.

Covers the two senders wired into
``POST /api/v1/portal/me/privacy-requests`` for ``request_type == erasure``:

* ``send_privacy_request_user_confirmation`` — confirms to the subject.
* ``send_privacy_request_admin_notification`` — alerts the tenant contact.

Tests mock ``send_email`` directly so we inspect the composed subject /
HTML / text bodies without touching Resend.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

from app.core.email.privacy import (
    _pick_tenant_contact_email,
    send_privacy_request_admin_notification,
    send_privacy_request_user_confirmation,
)
from app.core.portal_security import create_portal_access_token
from app.models.portal_user import PortalUser
from app.models.privacy_request import PrivacyRequest
from app.models.tenant import Tenant

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


# ---------------------------------------------------------------------------
# _pick_tenant_contact_email
# ---------------------------------------------------------------------------


class TestPickTenantContactEmail:
    def _tenant(self, **kwargs: Any) -> Tenant:
        return Tenant(id=uuid.uuid4(), name="T", slug="t", is_active=True, **kwargs)

    def test_returns_first_contact_person_email(self) -> None:
        tenant = self._tenant(
            contact_persons=[
                {"name": "Ada", "email": "ada@acme.test"},
                {"name": "Bob", "email": "bob@acme.test"},
            ],
        )
        assert _pick_tenant_contact_email(tenant) == "ada@acme.test"

    def test_skips_entries_without_email(self) -> None:
        tenant = self._tenant(
            contact_persons=[
                {"name": "NoEmail"},
                {"name": "Real", "email": "real@acme.test"},
            ],
        )
        assert _pick_tenant_contact_email(tenant) == "real@acme.test"

    def test_falls_back_to_resend_from_email(self) -> None:
        tenant = self._tenant(contact_persons=[], resend_from_email="ops@acme.test")
        assert _pick_tenant_contact_email(tenant) == "ops@acme.test"

    def test_returns_none_when_no_contact_configured(self) -> None:
        tenant = self._tenant(contact_persons=[])
        assert _pick_tenant_contact_email(tenant) is None


# ---------------------------------------------------------------------------
# send_privacy_request_user_confirmation
# ---------------------------------------------------------------------------


class TestUserConfirmation:
    @pytest.mark.asyncio
    async def test_composes_user_confirmation(self) -> None:
        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            ok = await send_privacy_request_user_confirmation(
                db=None,  # type: ignore[arg-type]
                tenant_id=uuid.uuid4(),
                recipient_email="subject@example.com",
                request_type="erasure",
                notes="please delete my data",
                tenant_name="Acme Corp",
            )
        assert ok is True

        kwargs = mock_send.await_args.kwargs
        positional = mock_send.await_args.args
        # positional: (recipient, subject, html, text)
        assert positional[0] == "subject@example.com"
        assert "Acme Corp" in positional[1]
        assert "Deletion (Art. 17)" in positional[2]
        assert "please delete my data" in positional[2]
        assert "subject@example.com" in positional[2]
        assert kwargs["email_type"] == "privacy_request_confirmation"

    @pytest.mark.asyncio
    async def test_escapes_notes_html(self) -> None:
        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            await send_privacy_request_user_confirmation(
                db=None,  # type: ignore[arg-type]
                tenant_id=uuid.uuid4(),
                recipient_email="s@example.com",
                request_type="erasure",
                notes="<script>alert('x')</script>",
                tenant_name="Acme <b>Corp</b>",
            )
        html = mock_send.await_args.args[2]
        assert "<script>" not in html
        assert "&lt;script&gt;" in html
        assert "<b>Corp</b>" not in html
        assert "Acme &lt;b&gt;Corp&lt;/b&gt;" in html

    @pytest.mark.asyncio
    async def test_omits_notes_block_when_empty(self) -> None:
        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            await send_privacy_request_user_confirmation(
                db=None,  # type: ignore[arg-type]
                tenant_id=uuid.uuid4(),
                recipient_email="s@example.com",
                request_type="erasure",
                notes=None,
                tenant_name="Acme",
            )
        html = mock_send.await_args.args[2]
        assert "Your note" not in html


# ---------------------------------------------------------------------------
# send_privacy_request_admin_notification
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def tenant_with_contact(db_session: AsyncSession) -> Tenant:
    tenant = Tenant(
        id=uuid.uuid4(),
        name="Acme Privacy Corp",
        slug=f"acme-priv-{uuid.uuid4().hex[:6]}",
        is_active=True,
        contact_persons=[
            {"name": "Data Protection Officer", "email": "dpo@acme.test"},
        ],
    )
    db_session.add(tenant)
    await db_session.commit()
    return tenant


class TestAdminNotification:
    @pytest.mark.asyncio
    async def test_sends_to_first_contact_person(self, db_session: AsyncSession, tenant_with_contact: Tenant) -> None:
        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            ok = await send_privacy_request_admin_notification(
                db_session,
                tenant_id=tenant_with_contact.id,
                request_type="erasure",
                subject_email="subject@example.com",
                notes="my note",
            )
        assert ok is True
        positional = mock_send.await_args.args
        kwargs = mock_send.await_args.kwargs
        assert positional[0] == "dpo@acme.test"
        assert "Acme Privacy Corp" in positional[1]
        assert "Deletion (Art. 17)" in positional[2]
        assert "subject@example.com" in positional[2]
        assert "my note" in positional[2]
        assert kwargs["email_type"] == "privacy_request_admin_notify"

    @pytest.mark.asyncio
    async def test_skips_when_tenant_has_no_contact_and_no_admin_users(
        self, db_session: AsyncSession
    ) -> None:
        tenant = Tenant(
            id=uuid.uuid4(),
            name="No Contact Corp",
            slug=f"no-c-{uuid.uuid4().hex[:6]}",
            is_active=True,
            contact_persons=[],
        )
        db_session.add(tenant)
        await db_session.commit()

        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            ok = await send_privacy_request_admin_notification(
                db_session,
                tenant_id=tenant.id,
                request_type="erasure",
                subject_email="subject@example.com",
                notes=None,
            )
        assert ok is False
        mock_send.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_returns_false_when_tenant_missing(self, db_session: AsyncSession) -> None:
        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            ok = await send_privacy_request_admin_notification(
                db_session,
                tenant_id=uuid.uuid4(),
                request_type="erasure",
                subject_email="x@example.com",
                notes=None,
            )
        assert ok is False
        mock_send.assert_not_awaited()


# ---------------------------------------------------------------------------
# Endpoint wiring — erasure POST triggers both backgrounded sends
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def portal_env(db_session: AsyncSession) -> dict[str, Any]:
    tenant = Tenant(
        id=uuid.uuid4(),
        name="Email Wiring Corp",
        slug=f"ewc-{uuid.uuid4().hex[:6]}",
        is_active=True,
        contact_persons=[{"name": "Ops", "email": "ops@wiring.test"}],
    )
    email = f"sub-{uuid.uuid4().hex[:6]}@example.com"
    portal_user = PortalUser(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=email,
        first_name="Wire",
        last_name="Tester",
        is_active=True,
    )
    db_session.add(tenant)
    await db_session.commit()
    db_session.add(portal_user)
    await db_session.commit()

    token = create_portal_access_token(portal_user.id, tenant.id)
    return {
        "tenant": tenant,
        "portal_user": portal_user,
        "email": email,
        "headers": {"Authorization": f"Bearer {token}"},
    }


class TestErasureEndpointTriggersEmails:
    @pytest.mark.asyncio
    async def test_erasure_request_schedules_both_emails(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        portal_env: dict[str, Any],
    ) -> None:
        recorded: list[tuple[Any, tuple[Any, ...], dict[str, Any]]] = []

        def fake_bg(send_fn: Any, *args: Any, **kwargs: Any) -> None:
            recorded.append((send_fn, args, kwargs))

        with patch(
            "app.api.v1.portal.privacy.send_email_background",
            side_effect=fake_bg,
        ):
            r = await client.post(
                "/api/v1/portal/me/privacy-requests",
                json={"request_type": "erasure", "notes": "please delete me"},
                headers=portal_env["headers"],
            )
        assert r.status_code == 200, r.text

        fns = [call[0].__name__ for call in recorded]
        assert "send_privacy_request_user_confirmation" in fns
        assert "send_privacy_request_admin_notification" in fns

        user_call = next(c for c in recorded if c[0].__name__ == "send_privacy_request_user_confirmation")
        assert user_call[2]["recipient_email"] == portal_env["email"]
        assert user_call[2]["tenant_id"] == portal_env["tenant"].id
        assert user_call[2]["tenant_name"] == "Email Wiring Corp"
        assert user_call[2]["notes"] == "please delete me"

        admin_call = next(c for c in recorded if c[0].__name__ == "send_privacy_request_admin_notification")
        assert admin_call[2]["tenant_id"] == portal_env["tenant"].id
        assert admin_call[2]["subject_email"] == portal_env["email"]
        assert admin_call[2]["notes"] == "please delete me"

    @pytest.mark.asyncio
    async def test_export_request_does_not_trigger_erasure_emails(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        portal_env: dict[str, Any],
    ) -> None:
        """Export runs inline with its own download — no notification emails."""
        recorded: list[Any] = []

        def fake_bg(send_fn: Any, *args: Any, **kwargs: Any) -> None:
            recorded.append(send_fn.__name__)

        with patch(
            "app.api.v1.portal.privacy.send_email_background",
            side_effect=fake_bg,
        ):
            r = await client.post(
                "/api/v1/portal/me/privacy-requests",
                json={"request_type": "export"},
                headers=portal_env["headers"],
            )
        assert r.status_code == 200, r.text
        # Neither privacy-notification helper fires on export.
        assert "send_privacy_request_user_confirmation" not in recorded
        assert "send_privacy_request_admin_notification" not in recorded

    @pytest.mark.asyncio
    async def test_erasure_row_still_persists_when_email_scheduling_is_mocked(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        portal_env: dict[str, Any],
    ) -> None:
        with patch(
            "app.api.v1.portal.privacy.send_email_background",
            side_effect=lambda *_a, **_k: None,
        ):
            r = await client.post(
                "/api/v1/portal/me/privacy-requests",
                json={"request_type": "erasure", "notes": None},
                headers=portal_env["headers"],
            )
        assert r.status_code == 200

        pr = await db_session.get(PrivacyRequest, uuid.UUID(r.json()["id"]))
        assert pr is not None
        assert pr.status == "pending_review"
