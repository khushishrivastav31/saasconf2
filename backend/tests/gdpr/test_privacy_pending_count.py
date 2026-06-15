"""Tests for GET /api/v1/privacy-requests/pending-count.

RED phase: tests fail until the endpoint is implemented.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

import pytest
import pytest_asyncio

from app.models.privacy_request import PrivacyRequest, PrivacyRequestStatus
from app.models.tenant import Tenant

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


@pytest_asyncio.fixture()
async def pending_count_env(
    db_session: AsyncSession,
    tenant_admin_user: Any,
    tenant: Tenant,
    tenant_admin_token: str,
) -> dict[str, Any]:
    return {
        "tenant": tenant,
        "headers": {"Authorization": f"Bearer {tenant_admin_token}"},
    }


async def _add_request(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    status: str,
    request_type: str = "erasure",
) -> PrivacyRequest:
    pr = PrivacyRequest(
        tenant_id=tenant_id,
        request_type=request_type,
    )
    pr.subject_emails = ["subject@example.com"]
    pr.status = status
    db.add(pr)
    await db.commit()
    return pr


class TestPrivacyPendingCount:
    @pytest.mark.asyncio
    async def test_returns_zero_when_no_requests(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        pending_count_env: dict[str, Any],
    ) -> None:
        r = await client.get(
            "/api/v1/privacy-requests/pending-count",
            headers=pending_count_env["headers"],
        )
        assert r.status_code == 200
        assert r.json()["pending_review"] == 0

    @pytest.mark.asyncio
    async def test_counts_pending_review_erasure_requests(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        pending_count_env: dict[str, Any],
    ) -> None:
        tenant_id = pending_count_env["tenant"].id
        await _add_request(db_session, tenant_id, PrivacyRequestStatus.PENDING_REVIEW.value)
        await _add_request(db_session, tenant_id, PrivacyRequestStatus.PENDING_REVIEW.value)
        await _add_request(db_session, tenant_id, PrivacyRequestStatus.APPROVED.value)
        await _add_request(db_session, tenant_id, PrivacyRequestStatus.COMPLETED.value)

        r = await client.get(
            "/api/v1/privacy-requests/pending-count",
            headers=pending_count_env["headers"],
        )
        assert r.status_code == 200
        assert r.json()["pending_review"] == 2

    @pytest.mark.asyncio
    async def test_scoped_to_tenant(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
        pending_count_env: dict[str, Any],
    ) -> None:
        other_tenant = Tenant(
            id=uuid.uuid4(),
            name="Other Corp",
            slug=f"other-{uuid.uuid4().hex[:6]}",
            is_active=True,
        )
        db_session.add(other_tenant)
        await db_session.commit()

        await _add_request(
            db_session, other_tenant.id, PrivacyRequestStatus.PENDING_REVIEW.value
        )

        r = await client.get(
            "/api/v1/privacy-requests/pending-count",
            headers=pending_count_env["headers"],
        )
        assert r.status_code == 200
        assert r.json()["pending_review"] == 0

    @pytest.mark.asyncio
    async def test_requires_tenant_admin(
        self,
        client: AsyncClient,
    ) -> None:
        r = await client.get("/api/v1/privacy-requests/pending-count")
        assert r.status_code == 401
