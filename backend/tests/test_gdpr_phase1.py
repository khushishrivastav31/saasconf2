"""Phase 1 tests for GDPR Art. 15 / 17 plumbing.

Covers:

* @validates(email) hooks on 9 subject-identifying models — assigning
  the plaintext email must auto-populate the companion ``email_hash``
  (or renamed variant) with ``hash_email(email)``.
* ``PrivacyRequest.subject_emails`` round-trip — setter normalizes and
  encrypts, getter decrypts; ``subject_email_hashes`` mirrors the input.
* ``BaseService.create_audit_log`` accepts and propagates
  ``subject_email_hash`` to the returned ``AuditLog`` instance.
* ``scripts.export_subject_data.build_export`` produces a ZIP whose
  ``manifest.json`` and per-table files reflect the seeded fixture.
"""

from __future__ import annotations

import io
import json
import uuid
import zipfile
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security.pii_crypto import decrypt_pii, hash_email
from app.models.alumni import Alumni
from app.models.applicant_activity import ApplicantActivityLog
from app.models.audit import AuditLog
from app.models.cfp_applicants import CFPApplicant
from app.models.email_log import EmailLog
from app.models.offer_attendee import OfferAttendee
from app.models.privacy_request import (
    PrivacyRequest,
    PrivacyRequestStatus,
    PrivacyRequestType,
)
from app.models.registration import Registration
from app.models.training_attendee import TrainingAttendee
from app.models.training_registration import (
    TrainingRegistration,
    TrainingRegistrationAttendee,
)
from app.services.base import BaseService
from scripts.export_subject_data import build_export

# ---------------------------------------------------------------------------
# Model @validates hooks — 9 subject-identifying tables
# ---------------------------------------------------------------------------


class TestEmailHashValidates:
    """Assigning .email (or its renamed variant) populates the hash column."""

    def test_registration_sets_email_hash(self) -> None:
        r = Registration(email="Alice@Example.com", first_name="Alice", last_name="A")
        assert r.email_hash == hash_email("Alice@Example.com")
        assert r.email_hash == hash_email("alice@example.com")  # normalization

    def test_cfp_applicant_sets_email_hash(self) -> None:
        a = CFPApplicant(email="speaker@example.com")
        assert a.email_hash == hash_email("speaker@example.com")

    def test_training_attendee_sets_email_hash(self) -> None:
        t = TrainingAttendee(email="student@example.com")
        assert t.email_hash == hash_email("student@example.com")

    def test_training_registration_sets_contact_email_hash(self) -> None:
        tr = TrainingRegistration(contact_email="corp@example.com")
        assert tr.contact_email_hash == hash_email("corp@example.com")

    def test_training_registration_attendee_sets_email_hash(self) -> None:
        a = TrainingRegistrationAttendee(email="person@example.com")
        assert a.email_hash == hash_email("person@example.com")

    def test_offer_attendee_sets_email_hash(self) -> None:
        oa = OfferAttendee(email="attendee@example.com")
        assert oa.email_hash == hash_email("attendee@example.com")

    def test_offer_attendee_none_clears_hash(self) -> None:
        oa = OfferAttendee(email=None)
        assert oa.email_hash is None

    def test_alumni_sets_email_hash(self) -> None:
        a = Alumni(email="alum@example.com")
        assert a.email_hash == hash_email("alum@example.com")

    def test_email_log_sets_recipient_email_hash(self) -> None:
        el = EmailLog(recipient_email="notify@example.com")
        assert el.recipient_email_hash == hash_email("notify@example.com")

    def test_applicant_activity_sets_applicant_email_hash(self) -> None:
        al = ApplicantActivityLog(applicant_email="applicant@example.com")
        assert al.applicant_email_hash == hash_email("applicant@example.com")

    def test_reassignment_updates_hash(self) -> None:
        r = Registration(email="first@example.com", first_name="A", last_name="B")
        original = r.email_hash
        r.email = "second@example.com"
        assert r.email_hash != original
        assert r.email_hash == hash_email("second@example.com")


# ---------------------------------------------------------------------------
# PrivacyRequest subject_emails round-trip
# ---------------------------------------------------------------------------


class TestPrivacyRequestSubjectEmails:
    def test_setter_normalizes_and_encrypts(self) -> None:
        pr = PrivacyRequest(
            tenant_id=uuid4(),
            request_type=PrivacyRequestType.EXPORT.value,
        )
        pr.subject_emails = ["  Alice@Example.com ", "BOB@example.com"]
        # Ciphertext is not plaintext.
        assert "alice@example.com" not in pr.subject_emails_encrypted
        assert "bob@example.com" not in pr.subject_emails_encrypted
        # Stored encrypted JSON decrypts to the normalized list.
        raw = decrypt_pii(pr.subject_emails_encrypted)
        assert raw is not None
        assert json.loads(raw) == ["alice@example.com", "bob@example.com"]
        # Hashes mirror the normalized list.
        assert pr.subject_email_hashes == [
            hash_email("alice@example.com"),
            hash_email("bob@example.com"),
        ]

    def test_getter_returns_normalized_plaintext(self) -> None:
        pr = PrivacyRequest(
            tenant_id=uuid4(),
            request_type=PrivacyRequestType.ERASURE.value,
        )
        pr.subject_emails = ["ONE@Example.com", "Two@Example.COM"]
        assert pr.subject_emails == ["one@example.com", "two@example.com"]

    def test_empty_input_yields_empty_hashes(self) -> None:
        pr = PrivacyRequest(
            tenant_id=uuid4(),
            request_type=PrivacyRequestType.EXPORT.value,
        )
        pr.subject_emails = []
        assert pr.subject_email_hashes == []
        assert pr.subject_emails == []

    def test_default_status_is_pending_review(self) -> None:
        # The server_default takes care of DB-level; we assert the enum value
        # is the documented Phase 1 starting state.
        assert PrivacyRequestStatus.PENDING_REVIEW.value == "pending_review"


# ---------------------------------------------------------------------------
# AuditLog subject_email_hash wiring
# ---------------------------------------------------------------------------


class TestAuditLogSubjectEmailHash:
    def test_create_audit_log_propagates_subject_email_hash(self) -> None:
        subject_hash = hash_email("watched@example.com")
        log = BaseService.create_audit_log(
            tenant_id=uuid4(),
            user_id=uuid4(),
            action="registration.view",
            resource_type="registration",
            resource_id=uuid4(),
            subject_email_hash=subject_hash,
        )
        assert isinstance(log, AuditLog)
        assert log.subject_email_hash == subject_hash

    def test_create_audit_log_defaults_subject_hash_to_none(self) -> None:
        log = BaseService.create_audit_log(
            tenant_id=uuid4(),
            user_id=uuid4(),
            action="settings.update",
            resource_type="settings",
            resource_id=uuid4(),
        )
        assert log.subject_email_hash is None


# ---------------------------------------------------------------------------
# scripts.export_subject_data.build_export — DB-backed smoke test
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def seeded_subject(db_session: AsyncSession):
    """Tenant + conference + registration for 'subject@example.com' plus
    one AuditLog row scoped to the same subject email hash. Returns the
    tuple (tenant_id, email)."""
    from app.models.booking import BookingOption
    from app.models.conference import Conference
    from app.models.registration import BillingProfile
    from app.models.tenant import Tenant

    tenant = Tenant(
        id=uuid.uuid4(),
        name="Export Corp",
        slug=f"export-corp-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    conference = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        name="ExportConf",
        abbreviation="EXP",
        is_active=True,
    )
    billing_profile = BillingProfile(
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
    booking_option = BookingOption(
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
        billing_profile_id=billing_profile.id,
        booking_option_id=booking_option.id,
        first_name="Export",
        last_name="Subject",
        email=email,
    )
    subject_hash = hash_email(email)
    audit = AuditLog(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        user_id=None,
        action="registration.view",
        resource_type="registration",
        resource_id=registration.id,
        subject_email_hash=subject_hash,
        details={},
    )
    db_session.add(tenant)
    await db_session.commit()
    db_session.add(conference)
    await db_session.commit()
    db_session.add_all([billing_profile, booking_option])
    await db_session.commit()
    db_session.add_all([registration, audit])
    await db_session.commit()
    return tenant.id, email


@pytest.mark.asyncio
async def test_build_export_emits_seeded_row_and_audit_event(db_session: AsyncSession, seeded_subject) -> None:
    tenant_id, email = seeded_subject
    blob, manifest_dict = await build_export(db_session, tenant_id, [email])
    assert manifest_dict["tenant_id"] == str(tenant_id)
    assert manifest_dict["record_counts"]["registrations"] == 1

    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        names = set(zf.namelist())
        assert "manifest.json" in names
        assert "audit_log.json" in names
        assert "data/registrations.json" in names

        manifest = json.loads(zf.read("manifest.json"))
        assert manifest["tenant_id"] == str(tenant_id)
        assert manifest["subjects"] == [email]
        assert manifest["subject_email_hashes"] == [hash_email(email)]
        assert manifest["record_counts"]["registrations"] == 1
        assert manifest["record_counts"]["audit_log"] == 1
        # A table with no matches is still present with count 0.
        assert manifest["record_counts"]["alumni"] == 0

        regs = json.loads(zf.read("data/registrations.json"))
        assert len(regs) == 1
        assert regs[0]["email"] == email
        assert regs[0]["email_hash"] == hash_email(email)

        audit_rows = json.loads(zf.read("audit_log.json"))
        assert len(audit_rows) == 1
        assert audit_rows[0]["subject_email_hash"] == hash_email(email)
        assert audit_rows[0]["action"] == "registration.view"


@pytest.mark.asyncio
async def test_build_export_missing_subject_returns_empty_sections(db_session: AsyncSession, seeded_subject) -> None:
    tenant_id, _email = seeded_subject
    blob, _manifest = await build_export(db_session, tenant_id, ["nobody@example.com"])

    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        manifest = json.loads(zf.read("manifest.json"))
        # Every section present, all counts zero.
        assert all(v == 0 for v in manifest["record_counts"].values())
        regs = json.loads(zf.read("data/registrations.json"))
        assert regs == []
