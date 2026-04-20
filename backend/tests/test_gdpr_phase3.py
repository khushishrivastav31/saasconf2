"""Phase 3 tests — GDPR Art. 17 erasure execution.

Covers the two new endpoints under ``/api/v1/privacy-requests/{id}``:

* ``preview-erasure`` — enumerates per-table row counts, defaults,
  allowed overrides, locked reasons.
* ``execute-erasure`` — validates chosen actions, writes the audit
  log + manifest inside the same transaction, deletes / anonymises,
  flips status to ``completed``.

Assertions focus on: preview shape, invoice lock under HGB §257,
billing-profile retention chain lock, happy-path execute, unknown
table → 422, cross-tenant isolation, audit entry contents.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.security import hash_password
from app.core.security.pii_crypto import hash_email
from app.models.audit import AuditLog
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.privacy_request import (
    PrivacyRequest,
    PrivacyRequestStatus,
)
from app.models.registration import BillingProfile, Registration
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from tests.conftest import _make_token, auth_headers

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession


SUBJECT_EMAIL = "erase-me@example.com"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def erasure_env(db_session: AsyncSession):
    """Tenant + admin + conference + registration + invoice for SUBJECT_EMAIL."""
    tenant = Tenant(
        id=uuid.uuid4(),
        name="Erasure Corp",
        slug=f"erase-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    admin = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=f"admin-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        first_name="Erase",
        last_name="Admin",
        role=UserRole.TENANT_ADMIN.value,
        is_active=True,
    )
    subject_user = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=SUBJECT_EMAIL,
        password_hash=hash_password("Password123!"),
        first_name="Erase",
        last_name="Subject",
        role=UserRole.USER.value,
        is_active=True,
    )
    conference = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="EraseConf",
        abbreviation="EC",
        is_active=True,
    )
    billing = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="1 Erase Ln",
        postal_code="10000",
        city="Berlin",
        country="DE",
        contact_first_name="Bill",
        contact_last_name="Contact",
    )
    billing.contact_email = SUBJECT_EMAIL
    booking = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Conf Pass",
        is_active=True,
    )
    registration = Registration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        billing_profile_id=billing.id,
        booking_option_id=booking.id,
        first_name="Erase",
        last_name="Subject",
        email=SUBJECT_EMAIL,
    )
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        invoice_number="ERA-001",
        template_type="registration",
        status="paid",
        issue_date=date(2026, 1, 1),
        due_date=date(2026, 1, 15),
        recipient_source_type="billing_profile",
        recipient_source_id=billing.id,
        recipient_name="Erase Subject",
        recipient_address_line1="1 Erase Ln",
        recipient_city="Berlin",
        recipient_postal_code="10000",
        recipient_country="DE",
        line_items=[],
        subtotal=Decimal("100.00"),
        tax_rate=Decimal("19.00"),
        tax_amount=Decimal("19.00"),
        total=Decimal("119.00"),
        currency="EUR",
    )
    invoice.recipient_email = SUBJECT_EMAIL

    db_session.add(tenant)
    await db_session.commit()
    db_session.add_all([admin, subject_user, conference])
    await db_session.commit()
    db_session.add_all([billing, booking])
    await db_session.commit()
    db_session.add_all([registration, invoice])
    await db_session.commit()

    return {
        "tenant": tenant,
        "admin": admin,
        "subject_user": subject_user,
        "billing": billing,
        "registration": registration,
        "invoice": invoice,
        "email": SUBJECT_EMAIL,
    }


@pytest.fixture()
def admin_headers(erasure_env) -> dict[str, str]:
    token = _make_token(erasure_env["admin"], modules=["conferences"])
    return auth_headers(token)


async def _create_and_approve_erasure(client: AsyncClient, headers: dict[str, str], email: str) -> str:
    """Create an erasure request and move it to ``approved``. Returns id."""
    create = await client.post(
        "/api/v1/privacy-requests",
        json={"request_type": "erasure", "subject_emails": [email]},
        headers=headers,
    )
    assert create.status_code == 201, create.text
    pr_id = create.json()["id"]
    approve = await client.post(f"/api/v1/privacy-requests/{pr_id}/approve", headers=headers)
    assert approve.status_code == 200, approve.text
    return pr_id


# ---------------------------------------------------------------------------
# Preview
# ---------------------------------------------------------------------------


class TestPreview:
    @pytest.mark.asyncio
    async def test_preview_returns_expected_shape(self, client: AsyncClient, admin_headers, erasure_env) -> None:
        pr_id = await _create_and_approve_erasure(client, admin_headers, erasure_env["email"])
        r = await client.post(f"/api/v1/privacy-requests/{pr_id}/preview-erasure", headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()

        tables = {e["table"]: e for e in body["entries"]}
        # All 15 LOOKUPS tables represented.
        assert len(tables) == 15

        # Registrations hit by email_hash — delete default, count=1.
        reg = tables["registrations"]
        assert reg["count"] == 1
        assert reg["default_action"] == "delete"
        assert reg["allowed_actions"] == ["delete"]

        # Invoices locked under HGB §257.
        inv = tables["invoices"]
        assert inv["count"] == 1
        assert inv["default_action"] == "skip"
        assert inv["allowed_actions"] == ["skip"]
        assert "HGB" in (inv["locked_reason"] or "")

        # Users row anonymise by default.
        usr = tables["users"]
        assert usr["count"] == 1
        assert usr["default_action"] == "anonymize"
        assert "anonymize" in usr["allowed_actions"]
        assert "delete" in usr["allowed_actions"]

    @pytest.mark.asyncio
    async def test_preview_locks_billing_profile_when_invoice_retained(
        self, client: AsyncClient, admin_headers, erasure_env
    ) -> None:
        pr_id = await _create_and_approve_erasure(client, admin_headers, erasure_env["email"])
        r = await client.post(f"/api/v1/privacy-requests/{pr_id}/preview-erasure", headers=admin_headers)
        body = r.json()
        tables = {e["table"]: e for e in body["entries"]}
        bp = tables["billing_profiles"]
        assert bp["default_action"] == "skip"
        assert bp["allowed_actions"] == ["skip"]
        assert bp["locked_reason"] and "HGB" in bp["locked_reason"]

    @pytest.mark.asyncio
    async def test_preview_rejects_non_erasure_request(self, client: AsyncClient, admin_headers) -> None:
        create = await client.post(
            "/api/v1/privacy-requests",
            json={"request_type": "export", "subject_emails": ["x@example.com"]},
            headers=admin_headers,
        )
        pr_id = create.json()["id"]
        r = await client.post(f"/api/v1/privacy-requests/{pr_id}/preview-erasure", headers=admin_headers)
        assert r.status_code in (400, 422)


# ---------------------------------------------------------------------------
# Execute
# ---------------------------------------------------------------------------


class TestExecute:
    @pytest.mark.asyncio
    async def test_execute_happy_path_default_actions(
        self,
        client: AsyncClient,
        admin_headers,
        erasure_env,
        db_session: AsyncSession,
    ) -> None:
        pr_id = await _create_and_approve_erasure(client, admin_headers, erasure_env["email"])
        r = await client.post(
            f"/api/v1/privacy-requests/{pr_id}/execute-erasure",
            json={"table_actions": {}},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["manifest"]["registrations"]["action"] == "delete"
        assert body["manifest"]["registrations"]["affected"] == 1
        assert body["manifest"]["invoices"]["action"] == "skip"
        assert body["manifest"]["users"]["action"] == "anonymize"

        # Registration row is gone.
        result = await db_session.execute(select(Registration).where(Registration.id == erasure_env["registration"].id))
        assert result.scalar_one_or_none() is None

        # Invoice row is intact and still holds the recipient email hash.
        await db_session.refresh(erasure_env["invoice"])
        assert erasure_env["invoice"].recipient_email_hash == hash_email(erasure_env["email"])

        # Subject user is anonymised in place.
        await db_session.refresh(erasure_env["subject_user"])
        assert erasure_env["subject_user"].email_hash is None
        assert erasure_env["subject_user"].email_encrypted is None
        assert erasure_env["subject_user"].first_name == "Erased"
        assert erasure_env["subject_user"].last_name == "Subject"

        # Privacy request flipped to completed + carries the manifest.
        result = await db_session.execute(select(PrivacyRequest).where(PrivacyRequest.id == uuid.UUID(pr_id)))
        pr = result.scalar_one()
        assert pr.status == PrivacyRequestStatus.COMPLETED.value
        assert pr.executed_at is not None
        assert pr.execution_manifest is not None
        assert "erasure" in pr.execution_manifest

        # Audit row written with action summary.
        result = await db_session.execute(
            select(AuditLog).where(
                AuditLog.action == "privacy_request.execute_erasure",
                AuditLog.resource_id == uuid.UUID(pr_id),
            )
        )
        audit = result.scalar_one()
        assert audit.subject_email_hash == hash_email(erasure_env["email"])
        assert audit.details["actions"]["registrations"] == "delete"
        assert audit.details["actions"]["invoices"] == "skip"

    @pytest.mark.asyncio
    async def test_execute_rejects_unknown_table(self, client: AsyncClient, admin_headers, erasure_env) -> None:
        pr_id = await _create_and_approve_erasure(client, admin_headers, erasure_env["email"])
        r = await client.post(
            f"/api/v1/privacy-requests/{pr_id}/execute-erasure",
            json={"table_actions": {"not_a_table": "delete"}},
            headers=admin_headers,
        )
        assert r.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_execute_rejects_disallowed_action(self, client: AsyncClient, admin_headers, erasure_env) -> None:
        pr_id = await _create_and_approve_erasure(client, admin_headers, erasure_env["email"])
        # invoices is locked to "skip" — attempting to delete must fail.
        r = await client.post(
            f"/api/v1/privacy-requests/{pr_id}/execute-erasure",
            json={"table_actions": {"invoices": "delete"}},
            headers=admin_headers,
        )
        assert r.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_execute_requires_approved_status(self, client: AsyncClient, admin_headers, erasure_env) -> None:
        create = await client.post(
            "/api/v1/privacy-requests",
            json={"request_type": "erasure", "subject_emails": [erasure_env["email"]]},
            headers=admin_headers,
        )
        pr_id = create.json()["id"]
        # Not approved — still pending_review.
        r = await client.post(
            f"/api/v1/privacy-requests/{pr_id}/execute-erasure",
            json={"table_actions": {}},
            headers=admin_headers,
        )
        assert r.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_execute_rejects_non_erasure_request(self, client: AsyncClient, admin_headers) -> None:
        create = await client.post(
            "/api/v1/privacy-requests",
            json={"request_type": "export", "subject_emails": ["x@example.com"]},
            headers=admin_headers,
        )
        pr_id = create.json()["id"]
        r = await client.post(
            f"/api/v1/privacy-requests/{pr_id}/execute-erasure",
            json={"table_actions": {}},
            headers=admin_headers,
        )
        assert r.status_code in (400, 422)


# ---------------------------------------------------------------------------
# Cross-tenant isolation
# ---------------------------------------------------------------------------


class TestCrossTenantIsolation:
    @pytest.mark.asyncio
    async def test_other_tenant_cannot_preview_or_execute(
        self,
        client: AsyncClient,
        admin_headers,
        erasure_env,
        db_session: AsyncSession,
    ) -> None:
        pr_id = await _create_and_approve_erasure(client, admin_headers, erasure_env["email"])

        other_tenant = Tenant(
            id=uuid.uuid4(),
            name="Other Erase Corp",
            slug=f"other-erase-{uuid.uuid4().hex[:8]}",
            is_active=True,
        )
        db_session.add(other_tenant)
        await db_session.commit()
        other_admin = User(
            id=uuid.uuid4(),
            tenant_id=other_tenant.id,
            email=f"other-admin-{uuid.uuid4().hex[:8]}@example.com",
            password_hash=hash_password("Password123!"),
            first_name="Other",
            last_name="Admin",
            role=UserRole.TENANT_ADMIN.value,
            is_active=True,
        )
        db_session.add(other_admin)
        await db_session.commit()

        other_headers = auth_headers(_make_token(other_admin, modules=["conferences"]))

        r = await client.post(
            f"/api/v1/privacy-requests/{pr_id}/preview-erasure",
            headers=other_headers,
        )
        assert r.status_code == 404

        r = await client.post(
            f"/api/v1/privacy-requests/{pr_id}/execute-erasure",
            json={"table_actions": {}},
            headers=other_headers,
        )
        assert r.status_code == 404
