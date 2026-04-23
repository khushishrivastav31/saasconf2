"""Phase 4 tests — Portal self-service privacy endpoints + allowlist safety rails.

Two distinct test groups:

1. **Schema coverage guard** (``TestPortalAllowlistIntegrity``) — proves
   every physical column on every portal-exportable model is accounted for
   either in ``PORTAL_EXPORT_FIELDS`` (explicit include, as a property
   name) or ``PORTAL_EXPORT_EXCLUDED_COLUMNS`` (explicit omit). Forces a
   test failure the moment anyone adds a new column without deciding
   which bucket it belongs to — the allowlist cannot silently drift.

2. **Runtime canary byte-scan** (``TestPortalExportLeakProofing``) — seeds
   the DB with distinctive canary strings in every internal-comment / notes
   field the allowlist is supposed to suppress, runs the portal export,
   and greps the raw ZIP bytes for any canary. The test is intentionally
   paranoid: it scans both ``manifest.json`` and every ``data/*.json``
   payload. A single hit anywhere fails the test.

Plus the usual happy-path coverage for the four new endpoints.
"""

from __future__ import annotations

import io
import json
import uuid
import zipfile
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import pytest
import pytest_asyncio

from app.core.gdpr.export import build_export
from app.core.gdpr.lookups import (
    LOOKUPS,
    PORTAL_EXPORT_EXCLUDED_COLUMNS,
    PORTAL_EXPORT_FIELDS,
)
from app.core.portal_security import create_portal_access_token
from app.core.security.pii_crypto import hash_email
from app.models.audit import AuditLog
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.portal_user import PortalUser
from app.models.privacy_request import PrivacyRequest, PrivacyRequestStatus, PrivacyRequestType
from app.models.registration import BillingProfile, Registration
from app.models.tenant import Tenant

if TYPE_CHECKING:
    from httpx import AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession

SUBJECT_EMAIL = "leaky@example.com"

# Canary strings — each is unique so a hit unambiguously identifies the source.
CANARY_INVOICE_INTERNAL = "INTERNAL_INVOICE_NOTE_RK9X3L"
CANARY_REGISTRATION_NOTES = "STAFF_REG_NOTE_PQ77M2"
CANARY_CUSTOMER_COMMENTS = "CUSTOMER_INTERNAL_COMMENT_ZH42VT"
CANARY_CUSTOMER_NOTES = "CUSTOMER_STAFF_NOTE_BN18QE"


# ---------------------------------------------------------------------------
# Schema coverage guard — every physical column must be accounted for.
# ---------------------------------------------------------------------------


class TestPortalAllowlistIntegrity:
    """Every exportable table's columns are either in FIELDS or EXCLUDED."""

    def test_every_exportable_table_has_full_column_coverage(self) -> None:
        unclassified: dict[str, set[str]] = {}
        for spec in LOOKUPS:
            if spec.name not in PORTAL_EXPORT_FIELDS:
                continue  # intentionally omitted from portal path
            physical = {c.name for c in spec.model.__table__.columns}
            included_props = PORTAL_EXPORT_FIELDS[spec.name]
            excluded = PORTAL_EXPORT_EXCLUDED_COLUMNS.get(spec.name, frozenset())
            # A physical column counts as "handled" iff it is either
            #   - listed in EXCLUDED, or
            #   - shares a name with an included property (exact-match),
            #     *or* its exclusion is implied by being the encrypted/hash
            #     sibling of an included property (already required to be
            #     in EXCLUDED — so the first branch suffices).
            missing = physical - excluded - included_props
            if missing:
                unclassified[spec.name] = missing

        assert not unclassified, (
            "Unclassified columns on portal-exportable models — add each to "
            "PORTAL_EXPORT_FIELDS or PORTAL_EXPORT_EXCLUDED_COLUMNS in "
            "app/core/gdpr/lookups.py:\n" + "\n".join(f"  {t}: {sorted(cols)}" for t, cols in unclassified.items())
        )

    def test_applicant_activity_logs_never_reachable_from_portal(self) -> None:
        assert "applicant_activity_logs" not in PORTAL_EXPORT_FIELDS

    def test_invoice_internal_comment_is_excluded(self) -> None:
        assert "internal_comment" in PORTAL_EXPORT_EXCLUDED_COLUMNS["invoices"]
        assert "internal_comment" not in PORTAL_EXPORT_FIELDS["invoices"]

    def test_customer_comments_and_notes_are_excluded(self) -> None:
        excluded = PORTAL_EXPORT_EXCLUDED_COLUMNS["customers"]
        assert "comments" in excluded
        assert "notes" in excluded
        fields = PORTAL_EXPORT_FIELDS["customers"]
        assert "comments" not in fields
        assert "notes" not in fields

    def test_registration_notes_excluded(self) -> None:
        assert "notes" in PORTAL_EXPORT_EXCLUDED_COLUMNS["registrations"]


# ---------------------------------------------------------------------------
# Runtime canary byte-scan — seeded "internal" strings must never surface.
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def leak_subject_env(db_session: AsyncSession):
    """Tenant + portal user + registration + invoice, with canaries in
    every staff-only comment field the portal export must never expose."""
    from app.models.customer import Customer

    tenant = Tenant(
        id=uuid.uuid4(),
        name="Leak Corp",
        slug=f"leak-corp-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    conference = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="LeakConf",
        abbreviation="LC",
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
        contact_email=SUBJECT_EMAIL,
    )
    booking = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Full Pass",
        is_active=True,
    )
    registration = Registration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        billing_profile_id=billing.id,
        booking_option_id=booking.id,
        first_name="Leaky",
        last_name="Subject",
        email=SUBJECT_EMAIL,
        notes=CANARY_REGISTRATION_NOTES,
    )
    invoice = Invoice(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        invoice_number="LEAK-0001",
        template_type="bank_transfer",
        status="paid",
        issue_date=datetime.now(UTC).date(),
        recipient_name="Leaky Subject",
        recipient_email=SUBJECT_EMAIL,
        line_items=[{"description": "Full Pass", "total": "100.00"}],
        subtotal=100,
        tax_amount=0,
        total=100,
        currency="EUR",
        internal_comment=CANARY_INVOICE_INTERNAL,
    )
    customer = Customer(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="Leaky GmbH",
        email=SUBJECT_EMAIL,
        comments=CANARY_CUSTOMER_COMMENTS,
        notes=CANARY_CUSTOMER_NOTES,
    )
    portal_user = PortalUser(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=SUBJECT_EMAIL,
        first_name="Leaky",
        last_name="Subject",
        is_active=True,
    )

    db_session.add(tenant)
    await db_session.commit()
    db_session.add(conference)
    await db_session.commit()
    db_session.add_all([billing, booking])
    await db_session.commit()
    db_session.add_all([registration, invoice, customer, portal_user])
    await db_session.commit()

    return {
        "tenant": tenant,
        "portal_user": portal_user,
        "registration": registration,
        "invoice": invoice,
        "customer": customer,
    }


class TestPortalExportLeakProofing:
    """Canary-string scan: no staff-only field may appear anywhere in the ZIP."""

    @pytest.mark.asyncio
    async def test_no_canary_survives_portal_export(
        self, db_session: AsyncSession, leak_subject_env: dict[str, Any]
    ) -> None:
        tenant = leak_subject_env["tenant"]
        blob, manifest = await build_export(db_session, tenant.id, [SUBJECT_EMAIL], mode="portal")

        # Manifest sanity.
        assert manifest["mode"] == "portal"
        assert manifest["subjects"] == [SUBJECT_EMAIL]

        canaries = (
            CANARY_INVOICE_INTERNAL,
            CANARY_REGISTRATION_NOTES,
            CANARY_CUSTOMER_COMMENTS,
            CANARY_CUSTOMER_NOTES,
        )

        with zipfile.ZipFile(io.BytesIO(blob)) as zf:
            # Scan every file in the ZIP — compressed bytes won't match
            # canary.encode(), so we must decompress to test the text.
            for member in zf.namelist():
                payload = zf.read(member).decode("utf-8", errors="replace")
                for canary in canaries:
                    assert canary not in payload, (
                        f"Portal export leaked canary {canary!r} inside "
                        f"ZIP member {member!r} — an internal/comment "
                        "field reached a portal-user download. Fix the "
                        "allowlist in app/core/gdpr/lookups.py "
                        "(PORTAL_EXPORT_FIELDS / "
                        "PORTAL_EXPORT_EXCLUDED_COLUMNS)."
                    )

            # Positive control: the subject's own data DID make it.
            regs = json.loads(zf.read("data/registrations.json"))
            assert len(regs) == 1
            assert regs[0]["email"] == SUBJECT_EMAIL
            # And critically: registration notes are NOT emitted.
            assert "notes" not in regs[0]

    @pytest.mark.asyncio
    async def test_admin_mode_still_dumps_everything(
        self, db_session: AsyncSession, leak_subject_env: dict[str, Any]
    ) -> None:
        """The admin-facing export intentionally shows staff annotations."""
        tenant = leak_subject_env["tenant"]
        blob, manifest = await build_export(db_session, tenant.id, [SUBJECT_EMAIL], mode="admin")
        assert manifest["mode"] == "admin"
        # Admin sees everything — the canaries should still be there so ops
        # can review before sending. Decompress and search.
        with zipfile.ZipFile(io.BytesIO(blob)) as zf:
            invoice_payload = zf.read("data/invoices.json").decode("utf-8")
            assert CANARY_INVOICE_INTERNAL in invoice_payload
            reg_payload = zf.read("data/registrations.json").decode("utf-8")
            assert CANARY_REGISTRATION_NOTES in reg_payload


# ---------------------------------------------------------------------------
# Portal endpoints — happy paths + security rails
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def portal_subject_env(db_session: AsyncSession):
    """Tenant + portal user with the seeded registration, ready to sign in."""
    tenant = Tenant(
        id=uuid.uuid4(),
        name="Portal Priv Corp",
        slug=f"pp-corp-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    conference = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="PortalPrivConf",
        abbreviation="PP",
        is_active=True,
    )
    billing = BillingProfile(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        street="Main",
        postal_code="10000",
        city="City",
        country="DE",
        contact_first_name="B",
        contact_last_name="C",
    )
    booking = BookingOption(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        name="Full",
        is_active=True,
    )
    email = f"subject-{uuid.uuid4().hex[:6]}@example.com"
    portal_user = PortalUser(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=email,
        first_name="Portal",
        last_name="Subject",
        is_active=True,
    )
    registration = Registration(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        conference_id=conference.id,
        billing_profile_id=billing.id,
        booking_option_id=booking.id,
        first_name="Portal",
        last_name="Subject",
        email=email,
    )

    db_session.add(tenant)
    await db_session.commit()
    db_session.add(conference)
    await db_session.commit()
    db_session.add_all([billing, booking])
    await db_session.commit()
    db_session.add_all([portal_user, registration])
    await db_session.commit()

    token = create_portal_access_token(portal_user.id, tenant.id)
    return {
        "tenant": tenant,
        "portal_user": portal_user,
        "email": email,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
    }


class TestPortalPrivacyEndpoints:
    @pytest.mark.asyncio
    async def test_export_runs_inline_and_returns_download_url(
        self,
        client: AsyncClient,
        portal_subject_env: dict[str, Any],
        db_session: AsyncSession,
    ) -> None:
        r = await client.post(
            "/api/v1/portal/me/privacy-requests",
            json={"request_type": "export", "notes": "self-serve"},
            headers=portal_subject_env["headers"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "completed"
        assert body["download_url"].startswith("/api/v1/portal/me/privacy-requests/")
        assert body["record_counts"]["registrations"] == 1

        # PrivacyRequest row was persisted + scoped to the portal user.
        pr_id = uuid.UUID(body["id"])
        pr = await db_session.get(PrivacyRequest, pr_id)
        assert pr is not None
        assert pr.portal_user_id == portal_subject_env["portal_user"].id
        assert pr.status == PrivacyRequestStatus.COMPLETED.value
        assert pr.request_type == PrivacyRequestType.EXPORT.value

    @pytest.mark.asyncio
    async def test_export_download_streams_the_zip_with_subject_email(
        self,
        client: AsyncClient,
        portal_subject_env: dict[str, Any],
    ) -> None:
        create = await client.post(
            "/api/v1/portal/me/privacy-requests",
            json={"request_type": "export"},
            headers=portal_subject_env["headers"],
        )
        body = create.json()

        download = await client.get(body["download_url"], headers=portal_subject_env["headers"])
        assert download.status_code == 200
        assert download.headers["content-type"] == "application/zip"

        with zipfile.ZipFile(io.BytesIO(download.content)) as zf:
            manifest = json.loads(zf.read("manifest.json"))
            assert manifest["mode"] == "portal"
            assert manifest["subjects"] == [portal_subject_env["email"]]
            # Activity summary is present; raw audit_log.json is NOT.
            assert "activity_summary.json" in zf.namelist()
            assert "audit_log.json" not in zf.namelist()

    @pytest.mark.asyncio
    async def test_erasure_is_queued_for_admin_review(
        self,
        client: AsyncClient,
        portal_subject_env: dict[str, Any],
        db_session: AsyncSession,
    ) -> None:
        r = await client.post(
            "/api/v1/portal/me/privacy-requests",
            json={"request_type": "erasure", "notes": "please delete"},
            headers=portal_subject_env["headers"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending_review"
        assert body["request_type"] == "erasure"

        pr = await db_session.get(PrivacyRequest, uuid.UUID(body["id"]))
        assert pr is not None
        assert pr.portal_user_id == portal_subject_env["portal_user"].id
        assert pr.executed_at is None

    @pytest.mark.asyncio
    async def test_client_cannot_forge_subject_emails(
        self,
        client: AsyncClient,
        portal_subject_env: dict[str, Any],
        db_session: AsyncSession,
    ) -> None:
        """Even if someone hand-rolls a POST with extra fields, the server
        uses ONLY the authenticated portal user's email."""
        r = await client.post(
            "/api/v1/portal/me/privacy-requests",
            json={
                "request_type": "export",
                "subject_emails": ["somebody-else@example.com"],  # extra field
                "notes": "attempt",
            },
            headers=portal_subject_env["headers"],
        )
        assert r.status_code == 200
        body = r.json()
        pr = await db_session.get(PrivacyRequest, uuid.UUID(body["id"]))
        assert pr is not None
        assert pr.subject_emails == [portal_subject_env["email"]]
        assert pr.subject_email_hashes == [hash_email(portal_subject_env["email"])]

    @pytest.mark.asyncio
    async def test_list_and_detail_scoped_to_caller(
        self,
        client: AsyncClient,
        portal_subject_env: dict[str, Any],
        db_session: AsyncSession,
    ) -> None:
        # Create one request.
        create = await client.post(
            "/api/v1/portal/me/privacy-requests",
            json={"request_type": "export"},
            headers=portal_subject_env["headers"],
        )
        pr_id = create.json()["id"]

        # Also seed a row belonging to a different portal user on the same tenant.
        other = PortalUser(
            id=uuid.uuid4(),
            tenant_id=portal_subject_env["tenant"].id,
            email=f"other-{uuid.uuid4().hex[:6]}@example.com",
            first_name="Other",
            last_name="User",
            is_active=True,
        )
        db_session.add(other)
        await db_session.commit()
        other_pr = PrivacyRequest(
            tenant_id=portal_subject_env["tenant"].id,
            request_type=PrivacyRequestType.ERASURE.value,
            portal_user_id=other.id,
        )
        other_pr.subject_emails = [other.email or ""]
        db_session.add(other_pr)
        await db_session.commit()

        # List only surfaces the caller's own rows.
        r = await client.get(
            "/api/v1/portal/me/privacy-requests",
            headers=portal_subject_env["headers"],
        )
        assert r.status_code == 200
        body = r.json()
        ids = {item["id"] for item in body["items"]}
        assert pr_id in ids
        assert str(other_pr.id) not in ids

        # Detail: own row OK.
        r = await client.get(
            f"/api/v1/portal/me/privacy-requests/{pr_id}",
            headers=portal_subject_env["headers"],
        )
        assert r.status_code == 200
        assert r.json()["id"] == pr_id
        # Detail response must never leak staff-user IDs or tenant_id.
        assert "tenant_id" not in r.json()
        assert "created_by" not in r.json()
        assert "reviewed_by" not in r.json()
        assert "subject_emails" not in r.json()

        # Detail: other user's row 404s.
        r = await client.get(
            f"/api/v1/portal/me/privacy-requests/{other_pr.id}",
            headers=portal_subject_env["headers"],
        )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_unauthenticated_request_is_401(self, client: AsyncClient) -> None:
        r = await client.get("/api/v1/portal/me/privacy-requests")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_portal_create_writes_audit_row(
        self,
        client: AsyncClient,
        portal_subject_env: dict[str, Any],
        db_session: AsyncSession,
    ) -> None:
        r = await client.post(
            "/api/v1/portal/me/privacy-requests",
            json={"request_type": "export"},
            headers=portal_subject_env["headers"],
        )
        pr_id = uuid.UUID(r.json()["id"])

        from sqlalchemy import select as sa_select

        result = await db_session.execute(
            sa_select(AuditLog).where(
                AuditLog.resource_id == pr_id,
                AuditLog.action == "privacy_request.portal_create",
            )
        )
        row = result.scalar_one()
        assert row.subject_email_hash == hash_email(portal_subject_env["email"])
        assert row.user_id is None  # portal user, no staff attribution
