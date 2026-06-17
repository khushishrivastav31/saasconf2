"""Speaker outcome emails fired by admin actions on privacy requests.

Covers Change 037:

* ``POST /{id}/execute-erasure`` — after commit, emails subject(s) confirming
  data was deleted (``send_privacy_erasure_completed``).
* ``POST /{id}/reject`` — after commit, emails subject(s) with the rejection
  reason (``send_privacy_erasure_rejected``).

Tests mock ``send_email`` (unit tests on the composers) and
``send_email_background`` (endpoint-wiring tests).
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

from app.core.email.privacy import (
    send_privacy_erasure_completed,
    send_privacy_erasure_rejected,
)
from app.models.privacy_request import PrivacyRequest, PrivacyRequestStatus
from app.models.tenant import Tenant

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


# ---------------------------------------------------------------------------
# Unit tests — email composers
# ---------------------------------------------------------------------------


class TestErasureCompletedEmail:
    @pytest.mark.asyncio
    async def test_sends_to_recipient(self) -> None:
        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            ok = await send_privacy_erasure_completed(
                db=None,  # type: ignore[arg-type]
                tenant_id=uuid.uuid4(),
                recipient_email="subject@example.com",
                tenant_name="Acme Corp",
            )
        assert ok is True
        positional = mock_send.await_args.args
        assert positional[0] == "subject@example.com"

    @pytest.mark.asyncio
    async def test_subject_contains_tenant_name(self) -> None:
        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            await send_privacy_erasure_completed(
                db=None,  # type: ignore[arg-type]
                tenant_id=uuid.uuid4(),
                recipient_email="s@example.com",
                tenant_name="Acme Corp",
            )
        subject = mock_send.await_args.args[1]
        assert "Acme Corp" in subject

    @pytest.mark.asyncio
    async def test_html_mentions_deletion_confirmed(self) -> None:
        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            await send_privacy_erasure_completed(
                db=None,  # type: ignore[arg-type]
                tenant_id=uuid.uuid4(),
                recipient_email="s@example.com",
                tenant_name="Acme Corp",
            )
        html = mock_send.await_args.args[2]
        assert "deleted" in html.lower()

    @pytest.mark.asyncio
    async def test_escapes_tenant_name(self) -> None:
        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            await send_privacy_erasure_completed(
                db=None,  # type: ignore[arg-type]
                tenant_id=uuid.uuid4(),
                recipient_email="s@example.com",
                tenant_name="<Evil & Corp>",
            )
        html = mock_send.await_args.args[2]
        assert "<Evil" not in html
        assert "&lt;Evil" in html

    @pytest.mark.asyncio
    async def test_email_type(self) -> None:
        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            await send_privacy_erasure_completed(
                db=None,  # type: ignore[arg-type]
                tenant_id=uuid.uuid4(),
                recipient_email="s@example.com",
                tenant_name="Acme",
            )
        assert mock_send.await_args.kwargs["email_type"] == "privacy_erasure_completed"


class TestErasureRejectedEmail:
    @pytest.mark.asyncio
    async def test_sends_to_recipient(self) -> None:
        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            ok = await send_privacy_erasure_rejected(
                db=None,  # type: ignore[arg-type]
                tenant_id=uuid.uuid4(),
                recipient_email="subject@example.com",
                rejection_reason="Data is required for ongoing litigation.",
                tenant_name="Acme Corp",
            )
        assert ok is True
        assert mock_send.await_args.args[0] == "subject@example.com"

    @pytest.mark.asyncio
    async def test_html_contains_rejection_reason(self) -> None:
        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            await send_privacy_erasure_rejected(
                db=None,  # type: ignore[arg-type]
                tenant_id=uuid.uuid4(),
                recipient_email="s@example.com",
                rejection_reason="Required for legal hold.",
                tenant_name="Acme Corp",
            )
        html = mock_send.await_args.args[2]
        assert "Required for legal hold." in html

    @pytest.mark.asyncio
    async def test_escapes_rejection_reason_html(self) -> None:
        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            await send_privacy_erasure_rejected(
                db=None,  # type: ignore[arg-type]
                tenant_id=uuid.uuid4(),
                recipient_email="s@example.com",
                rejection_reason="<script>alert('x')</script>",
                tenant_name="Acme Corp",
            )
        html = mock_send.await_args.args[2]
        assert "<script>" not in html
        assert "&lt;script&gt;" in html

    @pytest.mark.asyncio
    async def test_subject_contains_tenant_name(self) -> None:
        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            await send_privacy_erasure_rejected(
                db=None,  # type: ignore[arg-type]
                tenant_id=uuid.uuid4(),
                recipient_email="s@example.com",
                rejection_reason="reason",
                tenant_name="Acme Corp",
            )
        subject = mock_send.await_args.args[1]
        assert "Acme Corp" in subject

    @pytest.mark.asyncio
    async def test_email_type(self) -> None:
        mock_send = AsyncMock(return_value=True)
        with patch("app.core.email.privacy.send_email", mock_send):
            await send_privacy_erasure_rejected(
                db=None,  # type: ignore[arg-type]
                tenant_id=uuid.uuid4(),
                recipient_email="s@example.com",
                rejection_reason="reason",
                tenant_name="Acme",
            )
        assert mock_send.await_args.kwargs["email_type"] == "privacy_erasure_rejected"


# ---------------------------------------------------------------------------
# Endpoint-wiring fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def outcome_env(
    db_session: AsyncSession,
    tenant: Tenant,
    tenant_admin_user: Any,
    tenant_admin_token: str,
) -> dict[str, Any]:
    tenant.name = "Outcome Corp"
    await db_session.commit()
    return {
        "tenant": tenant,
        "headers": {"Authorization": f"Bearer {tenant_admin_token}"},
    }


async def _pending_erasure(db: AsyncSession, tenant_id: uuid.UUID) -> PrivacyRequest:
    pr = PrivacyRequest(
        tenant_id=tenant_id,
        request_type="erasure",
        status=PrivacyRequestStatus.PENDING_REVIEW.value,
    )
    pr.subject_emails = ["speaker@example.com"]
    db.add(pr)
    await db.commit()
    return pr


async def _approved_erasure(db: AsyncSession, tenant_id: uuid.UUID) -> PrivacyRequest:
    pr = PrivacyRequest(
        tenant_id=tenant_id,
        request_type="erasure",
        status=PrivacyRequestStatus.APPROVED.value,
    )
    pr.subject_emails = ["speaker@example.com"]
    db.add(pr)
    await db.commit()
    return pr


# ---------------------------------------------------------------------------
# Endpoint wiring — execute-erasure triggers completed email
# ---------------------------------------------------------------------------


class TestExecuteErasureEmailWiring:
    @pytest.mark.asyncio
    async def test_execute_erasure_schedules_completed_email(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        outcome_env: dict[str, Any],
    ) -> None:
        pr = await _approved_erasure(db_session, outcome_env["tenant"].id)
        recorded: list[tuple[Any, tuple[Any, ...], dict[str, Any]]] = []

        def fake_bg(send_fn: Any, *args: Any, **kwargs: Any) -> None:
            recorded.append((send_fn, args, kwargs))

        with patch(
            "app.api.v1.privacy_requests.send_email_background",
            side_effect=fake_bg,
        ):
            r = await client.post(
                f"/api/v1/privacy-requests/{pr.id}/execute-erasure",
                json={"table_actions": {}},
                headers=outcome_env["headers"],
            )
        assert r.status_code == 200, r.text

        fns = [call[0].__name__ for call in recorded]
        assert "send_privacy_erasure_completed" in fns

        call = next(c for c in recorded if c[0].__name__ == "send_privacy_erasure_completed")
        assert call[2]["recipient_email"] == "speaker@example.com"
        assert call[2]["tenant_id"] == outcome_env["tenant"].id

    @pytest.mark.asyncio
    async def test_execute_erasure_does_not_send_email_on_wrong_status(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        outcome_env: dict[str, Any],
    ) -> None:
        pr = await _pending_erasure(db_session, outcome_env["tenant"].id)
        recorded: list[Any] = []

        def fake_bg(send_fn: Any, *args: Any, **kwargs: Any) -> None:
            recorded.append(send_fn.__name__)

        with patch(
            "app.api.v1.privacy_requests.send_email_background",
            side_effect=fake_bg,
        ):
            r = await client.post(
                f"/api/v1/privacy-requests/{pr.id}/execute-erasure",
                json={"table_actions": {}},
                headers=outcome_env["headers"],
            )
        assert r.status_code == 400
        assert "send_privacy_erasure_completed" not in recorded


# ---------------------------------------------------------------------------
# Endpoint wiring — reject triggers rejected email
# ---------------------------------------------------------------------------


class TestRejectEmailWiring:
    @pytest.mark.asyncio
    async def test_reject_schedules_rejected_email(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        outcome_env: dict[str, Any],
    ) -> None:
        pr = await _pending_erasure(db_session, outcome_env["tenant"].id)
        recorded: list[tuple[Any, tuple[Any, ...], dict[str, Any]]] = []

        def fake_bg(send_fn: Any, *args: Any, **kwargs: Any) -> None:
            recorded.append((send_fn, args, kwargs))

        with patch(
            "app.api.v1.privacy_requests.send_email_background",
            side_effect=fake_bg,
        ):
            r = await client.post(
                f"/api/v1/privacy-requests/{pr.id}/reject",
                json={"rejection_reason": "Data required for legal hold."},
                headers=outcome_env["headers"],
            )
        assert r.status_code == 200, r.text

        fns = [call[0].__name__ for call in recorded]
        assert "send_privacy_erasure_rejected" in fns

        call = next(c for c in recorded if c[0].__name__ == "send_privacy_erasure_rejected")
        assert call[2]["recipient_email"] == "speaker@example.com"
        assert call[2]["rejection_reason"] == "Data required for legal hold."
        assert call[2]["tenant_id"] == outcome_env["tenant"].id

    @pytest.mark.asyncio
    async def test_reject_email_not_sent_on_already_rejected(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        outcome_env: dict[str, Any],
    ) -> None:
        pr = PrivacyRequest(
            tenant_id=outcome_env["tenant"].id,
            request_type="erasure",
            status=PrivacyRequestStatus.REJECTED.value,
        )
        pr.subject_emails = ["speaker@example.com"]
        db_session.add(pr)
        await db_session.commit()

        recorded: list[Any] = []

        def fake_bg(send_fn: Any, *args: Any, **kwargs: Any) -> None:
            recorded.append(send_fn.__name__)

        with patch(
            "app.api.v1.privacy_requests.send_email_background",
            side_effect=fake_bg,
        ):
            r = await client.post(
                f"/api/v1/privacy-requests/{pr.id}/reject",
                json={"rejection_reason": "Already done."},
                headers=outcome_env["headers"],
            )
        assert r.status_code == 400
        assert "send_privacy_erasure_rejected" not in recorded

    @pytest.mark.asyncio
    async def test_pr_row_persists_when_email_is_mocked(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        outcome_env: dict[str, Any],
    ) -> None:
        pr = await _pending_erasure(db_session, outcome_env["tenant"].id)

        with patch(
            "app.api.v1.privacy_requests.send_email_background",
            side_effect=lambda *_a, **_k: None,
        ):
            r = await client.post(
                f"/api/v1/privacy-requests/{pr.id}/reject",
                json={"rejection_reason": "No reason given."},
                headers=outcome_env["headers"],
            )
        assert r.status_code == 200

        await db_session.refresh(pr)
        assert pr.status == PrivacyRequestStatus.REJECTED.value
        assert pr.rejection_reason == "No reason given."
