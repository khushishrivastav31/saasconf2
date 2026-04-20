"""Phase 2 tests — Privacy Requests admin API (GDPR Art. 15 / 17).

Covers the seven endpoints under ``/api/v1/privacy-requests``:

* list (filters by status / type / email)
* create
* detail (audits a PRIVACY_REQUEST_VIEW)
* approve (erasure only)
* reject (either type, reason required)
* generate-export (export only; status → completed, manifest stored)
* download (streams ZIP, 410 after 7 days)

Cross-tenant isolation + status-transition guards are asserted alongside
the happy paths.
"""

from __future__ import annotations

import io
import json
import uuid
import zipfile
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.security import hash_password
from app.core.security.pii_crypto import hash_email
from app.models.audit import AuditLog
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.privacy_request import (
    PrivacyRequest,
    PrivacyRequestStatus,
    PrivacyRequestType,
)
from app.models.registration import BillingProfile, Registration
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import _make_token, auth_headers

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def seeded_subject_env(db_session: AsyncSession):
    """Tenant + admin + conference + one registration for 'subject@example.com'.

    Returns a dataclass-ish dict used by all endpoint tests.
    """
    tenant = Tenant(
        id=uuid.uuid4(),
        name="Privacy Corp",
        slug=f"privacy-corp-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    admin = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"admin-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        first_name="Privacy",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    conference = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="PrivacyConf",
        abbreviation="PC",
        is_active=True,
    )
    billing = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="123 Main",
        postal_code="12345",
        city="Testville",
        country="DE",
        contact_first_name="Billing",
        contact_last_name="Contact",
    )
    booking = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Full Pass",
        is_active=True,
    )
    email = "subject@example.com"
    registration = Registration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        billing_profile_id=billing.id,
        booking_option_id=booking.id,
        first_name="Export",
        last_name="Subject",
        email=email,
    )

    db_session.add(tenant)
    await db_session.commit()
    db_session.add_all([admin, conference])
    await db_session.commit()
    db_session.add_all([billing, booking])
    await db_session.commit()
    db_session.add(registration)
    await db_session.commit()

    return {
        "tenant": tenant,
        "admin": admin,
        "email": email,
        "registration": registration,
    }


@pytest.fixture()
def admin_headers(seeded_subject_env) -> dict[str, str]:
    token = _make_token(seeded_subject_env["admin"], modules=["conferences"])
    return auth_headers(token)


@pytest_asyncio.fixture()
async def other_tenant_admin(db_session: AsyncSession) -> User:
    """A tenant admin belonging to a *different* tenant (for RLS tests)."""
    other_tenant = Tenant(
        id=uuid.uuid4(),
        name="Other Corp",
        slug=f"other-corp-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db_session.add(other_tenant)
    await db_session.commit()
    admin = User(
        id=uuid.uuid4(),
        tenant_id=other_tenant.id,
        email=f"other-admin-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        first_name="Other",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()
    return admin


# ---------------------------------------------------------------------------
# Create + List + Detail
# ---------------------------------------------------------------------------


class TestCreateAndList:
    @pytest.mark.asyncio
    async def test_create_logs_request_and_returns_payload(
        self, client: AsyncClient, admin_headers, seeded_subject_env
    ) -> None:
        payload = {
            "request_type": "export",
            "subject_emails": ["Alice@Example.com", " alice@example.com "],
            "notes": "Alice filed a form",
        }
        r = await client.post("/api/v1/privacy-requests", json=payload, headers=admin_headers)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["request_type"] == "export"
        assert body["status"] == "pending_review"
        # Plaintext returned to the caller is normalized (lowered+stripped).
        assert body["subject_emails"] == ["alice@example.com", "alice@example.com"]
        assert body["notes"] == "Alice filed a form"
        assert body["created_by"] is not None

    @pytest.mark.asyncio
    async def test_cap_is_25_emails(self, client: AsyncClient, admin_headers) -> None:
        payload = {
            "request_type": "export",
            "subject_emails": [f"user{i}@example.com" for i in range(26)],
        }
        r = await client.post("/api/v1/privacy-requests", json=payload, headers=admin_headers)
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_list_filters_by_status_and_q(self, client: AsyncClient, admin_headers, seeded_subject_env) -> None:
        # Two requests for two subjects.
        await client.post(
            "/api/v1/privacy-requests",
            json={"request_type": "export", "subject_emails": ["alice@example.com"]},
            headers=admin_headers,
        )
        await client.post(
            "/api/v1/privacy-requests",
            json={"request_type": "erasure", "subject_emails": ["bob@example.com"]},
            headers=admin_headers,
        )

        # Full list returns both.
        r = await client.get("/api/v1/privacy-requests", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["total"] == 2

        # Filter by request type.
        r = await client.get(
            "/api/v1/privacy-requests",
            headers=admin_headers,
            params={"request_type": "erasure"},
        )
        assert r.json()["total"] == 1
        assert r.json()["items"][0]["request_type"] == "erasure"

        # Filter by plaintext email hashes.
        r = await client.get(
            "/api/v1/privacy-requests",
            headers=admin_headers,
            params={"q": "alice@example.com"},
        )
        assert r.json()["total"] == 1
        assert r.json()["items"][0]["request_type"] == "export"

    @pytest.mark.asyncio
    async def test_detail_emits_view_audit(
        self, client: AsyncClient, admin_headers, seeded_subject_env, db_session: AsyncSession
    ) -> None:
        email = seeded_subject_env["email"]
        create = await client.post(
            "/api/v1/privacy-requests",
            json={"request_type": "export", "subject_emails": [email]},
            headers=admin_headers,
        )
        pr_id = create.json()["id"]

        r = await client.get(f"/api/v1/privacy-requests/{pr_id}", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == pr_id
        assert body["subject_emails"] == [email]

        # PRIVACY_REQUEST_VIEW audit row exists.
        result = await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == "privacy_request.view",
                AuditLog.resource_id == uuid.UUID(pr_id),
            )
        )
        row = result.scalar_one()
        assert row.subject_email_hash == hash_email(email)


# ---------------------------------------------------------------------------
# Approve / Reject
# ---------------------------------------------------------------------------


class TestApproveReject:
    @pytest.mark.asyncio
    async def test_approve_only_erasure(self, client: AsyncClient, admin_headers, seeded_subject_env) -> None:
        # Erasure → approved OK.
        create = await client.post(
            "/api/v1/privacy-requests",
            json={"request_type": "erasure", "subject_emails": ["x@example.com"]},
            headers=admin_headers,
        )
        pr_id = create.json()["id"]
        r = await client.post(f"/api/v1/privacy-requests/{pr_id}/approve", headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "approved"
        assert r.json()["reviewed_by"] is not None

        # Second approve rejected (already terminal).
        r2 = await client.post(f"/api/v1/privacy-requests/{pr_id}/approve", headers=admin_headers)
        assert r2.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_approve_export_rejected(self, client: AsyncClient, admin_headers, seeded_subject_env) -> None:
        create = await client.post(
            "/api/v1/privacy-requests",
            json={"request_type": "export", "subject_emails": ["x@example.com"]},
            headers=admin_headers,
        )
        r = await client.post(
            f"/api/v1/privacy-requests/{create.json()['id']}/approve",
            headers=admin_headers,
        )
        assert r.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_reject_requires_reason_and_persists(
        self, client: AsyncClient, admin_headers, seeded_subject_env
    ) -> None:
        create = await client.post(
            "/api/v1/privacy-requests",
            json={"request_type": "erasure", "subject_emails": ["x@example.com"]},
            headers=admin_headers,
        )
        pr_id = create.json()["id"]

        # Missing reason → 422.
        r = await client.post(f"/api/v1/privacy-requests/{pr_id}/reject", json={}, headers=admin_headers)
        assert r.status_code == 422

        # Proper reject.
        r = await client.post(
            f"/api/v1/privacy-requests/{pr_id}/reject",
            json={"rejection_reason": "Duplicate of earlier ticket"},
            headers=admin_headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "rejected"
        assert body["rejection_reason"] == "Duplicate of earlier ticket"


# ---------------------------------------------------------------------------
# Generate export + download
# ---------------------------------------------------------------------------


class TestGenerateAndDownload:
    @pytest.mark.asyncio
    async def test_generate_export_completes_request(
        self,
        client: AsyncClient,
        admin_headers,
        seeded_subject_env,
        db_session: AsyncSession,
    ) -> None:
        email = seeded_subject_env["email"]
        create = await client.post(
            "/api/v1/privacy-requests",
            json={"request_type": "export", "subject_emails": [email]},
            headers=admin_headers,
        )
        pr_id = create.json()["id"]

        r = await client.post(
            f"/api/v1/privacy-requests/{pr_id}/generate-export",
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["download_url"] == f"/api/v1/privacy-requests/{pr_id}/download"
        assert body["record_counts"]["registrations"] == 1
        assert "executed_at" in body

        # Detail reflects the new state.
        d = await client.get(f"/api/v1/privacy-requests/{pr_id}", headers=admin_headers)
        assert d.json()["status"] == "completed"
        assert d.json()["execution_manifest"]["record_counts"]["registrations"] == 1

    @pytest.mark.asyncio
    async def test_generate_rejects_erasure(self, client: AsyncClient, admin_headers, seeded_subject_env) -> None:
        create = await client.post(
            "/api/v1/privacy-requests",
            json={"request_type": "erasure", "subject_emails": ["x@example.com"]},
            headers=admin_headers,
        )
        r = await client.post(
            f"/api/v1/privacy-requests/{create.json()['id']}/generate-export",
            headers=admin_headers,
        )
        assert r.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_download_streams_zip_with_expected_layout(
        self, client: AsyncClient, admin_headers, seeded_subject_env
    ) -> None:
        email = seeded_subject_env["email"]
        create = await client.post(
            "/api/v1/privacy-requests",
            json={"request_type": "export", "subject_emails": [email]},
            headers=admin_headers,
        )
        pr_id = create.json()["id"]
        await client.post(
            f"/api/v1/privacy-requests/{pr_id}/generate-export",
            headers=admin_headers,
        )

        r = await client.get(f"/api/v1/privacy-requests/{pr_id}/download", headers=admin_headers)
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/zip"
        with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
            names = set(zf.namelist())
            assert "manifest.json" in names
            assert "audit_log.json" in names
            assert "data/registrations.json" in names
            manifest = json.loads(zf.read("manifest.json"))
            assert manifest["subjects"] == [email]

    @pytest.mark.asyncio
    async def test_download_returns_410_after_window(
        self,
        client: AsyncClient,
        admin_headers,
        seeded_subject_env,
        db_session: AsyncSession,
    ) -> None:
        email = seeded_subject_env["email"]
        create = await client.post(
            "/api/v1/privacy-requests",
            json={"request_type": "export", "subject_emails": [email]},
            headers=admin_headers,
        )
        pr_id = create.json()["id"]
        await client.post(
            f"/api/v1/privacy-requests/{pr_id}/generate-export",
            headers=admin_headers,
        )

        # Backdate executed_at past the 7-day window.
        result = await db_session.execute(select(PrivacyRequest).where(PrivacyRequest.id == uuid.UUID(pr_id)))
        pr = result.scalar_one()
        pr.executed_at = datetime.now(UTC) - timedelta(days=8)
        await db_session.commit()

        r = await client.get(f"/api/v1/privacy-requests/{pr_id}/download", headers=admin_headers)
        assert r.status_code == 410

    @pytest.mark.asyncio
    async def test_download_only_when_completed(self, client: AsyncClient, admin_headers, seeded_subject_env) -> None:
        create = await client.post(
            "/api/v1/privacy-requests",
            json={"request_type": "export", "subject_emails": ["x@example.com"]},
            headers=admin_headers,
        )
        # No generate-export call — status is still pending_review.
        r = await client.get(
            f"/api/v1/privacy-requests/{create.json()['id']}/download",
            headers=admin_headers,
        )
        assert r.status_code in (400, 422)


# ---------------------------------------------------------------------------
# Cross-tenant isolation
# ---------------------------------------------------------------------------


class TestCrossTenantIsolation:
    @pytest.mark.asyncio
    async def test_other_tenant_cannot_see_or_mutate_request(
        self,
        client: AsyncClient,
        admin_headers,
        seeded_subject_env,
        other_tenant_admin,
    ) -> None:
        # Tenant A creates a request.
        create = await client.post(
            "/api/v1/privacy-requests",
            json={"request_type": "export", "subject_emails": ["x@example.com"]},
            headers=admin_headers,
        )
        pr_id = create.json()["id"]

        other_headers = auth_headers(_make_token(other_tenant_admin, modules=["conferences"]))

        # Tenant B list is empty.
        r = await client.get("/api/v1/privacy-requests", headers=other_headers)
        assert r.status_code == 200
        assert r.json()["total"] == 0

        # Tenant B detail → 404.
        r = await client.get(f"/api/v1/privacy-requests/{pr_id}", headers=other_headers)
        assert r.status_code == 404

        # Tenant B reject → 404.
        r = await client.post(
            f"/api/v1/privacy-requests/{pr_id}/reject",
            json={"rejection_reason": "spite"},
            headers=other_headers,
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Status type enum coverage (defensive — maps to privacy_request.py constants)
# ---------------------------------------------------------------------------


def test_enum_terminal_states() -> None:
    assert PrivacyRequestType.EXPORT.value == "export"
    assert PrivacyRequestType.ERASURE.value == "erasure"
    assert PrivacyRequestStatus.PENDING_REVIEW.value == "pending_review"
    assert PrivacyRequestStatus.APPROVED.value == "approved"
    assert PrivacyRequestStatus.REJECTED.value == "rejected"
    assert PrivacyRequestStatus.COMPLETED.value == "completed"
