"""Shared subject-data lookup catalogue.

One authoritative list of every table that holds PII for a data subject,
the email-hash column to match on, and the per-category erasure policy.
Consumed by both ``scripts/export_subject_data`` (Art. 15 export) and
``app.core.gdpr.erasure`` (Art. 17 erasure) so the two can never drift.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.models.alumni import Alumni
from app.models.applicant_activity import ApplicantActivityLog
from app.models.cfp_applicants import CFPApplicant
from app.models.customer import Customer
from app.models.email_log import EmailLog
from app.models.invoice import Invoice
from app.models.offer_attendee import OfferAttendee
from app.models.portal_user import PortalUser
from app.models.registration import BillingProfile, Registration
from app.models.trainer import Trainer
from app.models.training_attendee import TrainingAttendee
from app.models.training_registration import TrainingRegistration, TrainingRegistrationAttendee
from app.models.user import User

ErasureAction = Literal["delete", "anonymize", "skip"]


@dataclass(frozen=True)
class LookupSpec:
    """One table's email-hash lookup plus erasure policy.

    ``model`` is the SQLAlchemy model, ``hash_attr`` is the attribute name
    on the model that holds the hash (e.g. ``"email_hash"`` or
    ``"contact_email_hash"``).

    ``erasure_default`` is the action the UI pre-selects for this table;
    ``allowed_actions`` restricts the admin's override choices. A table
    that is legally retained (``invoices``) has ``allowed_actions =
    {"skip"}`` — the UI locks it.

    ``locked_reason`` is the human-readable explanation shown next to a
    locked row in the preview; ``None`` when the admin has free choice.
    """

    name: str
    model: type
    hash_attr: str
    erasure_default: ErasureAction = "delete"
    allowed_actions: frozenset[ErasureAction] = field(default_factory=lambda: frozenset({"delete"}))
    locked_reason: str | None = None


LOOKUPS: list[LookupSpec] = [
    LookupSpec(
        "users",
        User,
        "email_hash",
        erasure_default="anonymize",
        allowed_actions=frozenset({"anonymize", "delete"}),
    ),
    LookupSpec(
        "portal_users",
        PortalUser,
        "email_hash",
        erasure_default="anonymize",
        allowed_actions=frozenset({"anonymize", "delete"}),
    ),
    LookupSpec(
        "invoices",
        Invoice,
        "recipient_email_hash",
        erasure_default="skip",
        allowed_actions=frozenset({"skip"}),
        locked_reason="HGB §257: 10-year retention for accounting records",
    ),
    LookupSpec(
        "billing_profiles",
        BillingProfile,
        "contact_email_hash",
        erasure_default="anonymize",
        allowed_actions=frozenset({"anonymize", "delete", "skip"}),
    ),
    LookupSpec(
        "trainers",
        Trainer,
        "email_hash",
        erasure_default="anonymize",
        allowed_actions=frozenset({"anonymize", "delete"}),
    ),
    LookupSpec(
        "customers",
        Customer,
        "email_hash",
        erasure_default="anonymize",
        allowed_actions=frozenset({"anonymize", "delete"}),
    ),
    LookupSpec(
        "registrations",
        Registration,
        "email_hash",
        erasure_default="delete",
        allowed_actions=frozenset({"delete"}),
    ),
    LookupSpec(
        "cfp_applicants",
        CFPApplicant,
        "email_hash",
        erasure_default="delete",
        allowed_actions=frozenset({"delete"}),
    ),
    LookupSpec(
        "training_attendees",
        TrainingAttendee,
        "email_hash",
        erasure_default="delete",
        allowed_actions=frozenset({"delete"}),
    ),
    LookupSpec(
        "training_registrations",
        TrainingRegistration,
        "contact_email_hash",
        erasure_default="delete",
        allowed_actions=frozenset({"delete"}),
    ),
    LookupSpec(
        "training_registration_attendees",
        TrainingRegistrationAttendee,
        "email_hash",
        erasure_default="delete",
        allowed_actions=frozenset({"delete"}),
    ),
    LookupSpec(
        "offer_attendees",
        OfferAttendee,
        "email_hash",
        erasure_default="delete",
        allowed_actions=frozenset({"delete"}),
    ),
    LookupSpec(
        "alumni",
        Alumni,
        "email_hash",
        erasure_default="delete",
        allowed_actions=frozenset({"delete"}),
    ),
    LookupSpec(
        "email_logs",
        EmailLog,
        "recipient_email_hash",
        erasure_default="delete",
        allowed_actions=frozenset({"delete"}),
    ),
    LookupSpec(
        "applicant_activity_logs",
        ApplicantActivityLog,
        "applicant_email_hash",
        erasure_default="delete",
        allowed_actions=frozenset({"delete"}),
    ),
]


LOOKUPS_BY_NAME: dict[str, LookupSpec] = {spec.name: spec for spec in LOOKUPS}


# --- Portal self-serve export: strict allowlist ---------------------------
#
# The admin-initiated export (`/api/v1/privacy-requests/{id}/generate-export`)
# dumps every physical column because an admin reviews the ZIP before sending.
# The portal self-serve export runs through the two dicts below: what the user
# gets is defined exhaustively; anything not listed is not exported.
#
# Keys are LookupSpec.name (table name). Tables absent from
# ``PORTAL_EXPORT_FIELDS`` are never reachable from the portal path.
#
# Emails, phones, and VAT numbers are exposed via model @property accessors
# (e.g. ``row.email``) so the subject sees plaintext of their own PII rather
# than ciphertext. The allowlist stores the OUTPUT key; the encrypted/hash
# columns that back the property are listed in EXCLUDED_COLUMNS so the
# schema-level guard test can prove every physical column is accounted for.
#
# Tenant-inserted annotations about the subject (``internal_comment``,
# admin-edited ``notes`` / ``comments`` fields) are intentionally omitted —
# see the Phase 4 plan for the audit that produced this list.

PORTAL_EXPORT_FIELDS: dict[str, frozenset[str]] = {
    "users": frozenset(
        {
            "first_name",
            "last_name",
            "email",
            "pronouns",
            "created_at",
        }
    ),
    "portal_users": frozenset(
        {
            "first_name",
            "last_name",
            "email",
            "phone",
            "pronouns",
            "title",
            "company",
            "bio",
            "social_links",
            "address_line_1",
            "address_line_2",
            "city",
            "postal_code",
            "country",
            "theme_preference",
            "email_verified_at",
            "last_login_at",
            "created_at",
            "updated_at",
        }
    ),
    "invoices": frozenset(
        {
            "invoice_number",
            "template_type",
            "status",
            "issue_date",
            "due_date",
            "recipient_name",
            "recipient_email",
            "recipient_address_line1",
            "recipient_address_line2",
            "recipient_city",
            "recipient_state",
            "recipient_postal_code",
            "recipient_country",
            "recipient_vat_number",
            "procurement_code",
            "payment_method",
            "discount_code",
            "discount_amount",
            "line_items",
            "subtotal",
            "tax_rate",
            "tax_amount",
            "total",
            "currency",
            "exchange_rate_used",
            "vat_auto_calculated",
            "attendance_type",
            "notes",
            "contact_persons",
            "created_at",
        }
    ),
    "billing_profiles": frozenset(
        {
            "company_name",
            "street",
            "postal_code",
            "city",
            "country",
            "contact_first_name",
            "contact_last_name",
            "contact_email",
            "contact_phone",
            "vat_number",
            "vat_validated",
            "procurement_code",
            "payment_method",
            "discount_code",
            "created_at",
        }
    ),
    "trainers": frozenset(
        {
            "first_name",
            "last_name",
            "email",
            "phone",
            "pronouns",
            "vita",
            "created_at",
        }
    ),
    "customers": frozenset(
        {
            "name",
            "contact_person",
            "email",
            "phone",
            "website",
            "address_line1",
            "address_line2",
            "city",
            "state",
            "postal_code",
            "country",
            "vat_number",
            "contact_persons",
            "created_at",
        }
    ),
    "registrations": frozenset(
        {
            "first_name",
            "last_name",
            "email",
            "pronouns",
            "job_title",
            "department",
            "phone",
            "registration_mode",
            "status",
            "created_at",
        }
    ),
    "cfp_applicants": frozenset(
        {
            "first_name",
            "last_name",
            "pronouns",
            "email",
            "phone",
            "title",
            "company",
            "bio",
            "allow_out_of_timeframe",
            "social_links",
            "needs_accessibility",
            "accessibility_details",
            "agrees_to_recording",
            "email_verified_at",
            "address_line_1",
            "address_line_2",
            "city",
            "postal_code",
            "country",
            "created_at",
        }
    ),
    "training_attendees": frozenset(
        {
            "first_name",
            "last_name",
            "email",
            "status",
            "created_at",
        }
    ),
    "training_registrations": frozenset(
        {
            "status",
            "language",
            "company_name",
            "street",
            "postal_code",
            "city",
            "country",
            "vat_number",
            "contact_first_name",
            "contact_last_name",
            "contact_email",
            "contact_phone",
            "payment_method",
            "po_number",
            "discount_code",
            "discount_amount",
            "subtotal",
            "vat_amount",
            "total",
            "currency",
            "created_at",
        }
    ),
    "training_registration_attendees": frozenset(
        {
            "first_name",
            "last_name",
            "email",
            "language",
            "include_exam",
            "exam_language",
            "exam_mode",
            "extra_time",
            "created_at",
        }
    ),
    "offer_attendees": frozenset(
        {
            "first_name",
            "last_name",
            "email",
            "certification",
            "exam_mode",
            "extra_time",
            "exam_language",
            "created_at",
        }
    ),
    "alumni": frozenset(
        {
            "email",
            "first_name",
            "last_name",
            "company",
            "source",
            "created_at",
        }
    ),
    "email_logs": frozenset(
        {
            "subject",
            "email_type",
            "status",
            "created_at",
        }
    ),
    # applicant_activity_logs: deliberately absent — staff audit trail, not
    # subject-provided data. Art. 15(1)(c) categories of recipients are
    # covered by the privacy policy, not by handing over the log.
}

# Every physical column on an exportable model that is NOT emitted directly.
# Columns backed by a property (e.g. email_encrypted + email_hash → ``email``)
# are listed here; the property name appears in PORTAL_EXPORT_FIELDS above.
PORTAL_EXPORT_EXCLUDED_COLUMNS: dict[str, frozenset[str]] = {
    "users": frozenset(
        {
            "id",
            "tenant_id",
            "email_encrypted",
            "email_hash",
            "password_hash",
            "role",
            "is_active",
            "has_all_conference_access",
            "last_login",
            "updated_at",
            "message_notifications_enabled",
            "theme_preference",
        }
    ),
    "portal_users": frozenset(
        {
            "id",
            "tenant_id",
            "email_encrypted",
            "email_hash",
            "password_hash",
            "phone_encrypted",
            "phone_hash",
            "is_active",
        }
    ),
    "invoices": frozenset(
        {
            "id",
            "tenant_id",
            "conference_id",
            "recipient_source_type",
            "recipient_source_id",
            "recipient_email_encrypted",
            "recipient_email_hash",
            "recipient_vat_number_encrypted",
            "recipient_vat_number_hash",
            "internal_comment",
            "related_invoice_id",
            "replaced_by_invoice_id",
            "replaces_invoice_id",
            "replacement_reason",
            "stripe_payment_intent_id",
            "stripe_charge_id",
            "stripe_payment_link_url",
            "is_active",
            "updated_at",
        }
    ),
    "billing_profiles": frozenset(
        {
            "id",
            "tenant_id",
            "conference_id",
            "contact_phone_encrypted",
            "contact_phone_hash",
            "contact_email_encrypted",
            "contact_email_hash",
            "vat_number_encrypted",
            "vat_number_hash",
            "updated_at",
        }
    ),
    "trainers": frozenset(
        {
            "id",
            "tenant_id",
            "email_encrypted",
            "email_hash",
            "phone_encrypted",
            "phone_hash",
            "is_active",
            "is_internal",
            "updated_at",
        }
    ),
    "customers": frozenset(
        {
            "id",
            "tenant_id",
            "email_encrypted",
            "email_hash",
            "phone_encrypted",
            "phone_hash",
            "vat_number_encrypted",
            "vat_number_hash",
            "price",
            "currency",
            "comments",
            "notes",
            "is_active",
            "updated_at",
        }
    ),
    "registrations": frozenset(
        {
            "id",
            "tenant_id",
            "conference_id",
            "billing_profile_id",
            "email_hash",
            "booking_option_id",
            "main_session_id",
            "notes",
            "created_by",
            "updated_at",
        }
    ),
    "cfp_applicants": frozenset(
        {
            "id",
            "tenant_id",
            "email_hash",
            "password_hash",
            "message_notifications_enabled",
            "theme_preference",
            "portal_user_id",
            "updated_at",
        }
    ),
    "training_attendees": frozenset(
        {
            "id",
            "tenant_id",
            "email_hash",
            "notes",
            "portal_user_id",
            "updated_at",
        }
    ),
    "training_registrations": frozenset(
        {
            "id",
            "tenant_id",
            "placement_id",
            "contact_email_hash",
            "payment_intent_id",
            "notes",
            "updated_at",
        }
    ),
    "training_registration_attendees": frozenset(
        {
            "id",
            "tenant_id",
            "registration_id",
            "attendee_id",
            "email_hash",
        }
    ),
    "offer_attendees": frozenset(
        {
            "id",
            "tenant_id",
            "offer_id",
            "placement_id",
            "attendee_id",
            "email_hash",
            "comments",
            "updated_at",
        }
    ),
    "alumni": frozenset(
        {
            "id",
            "tenant_id",
            "conference_id",
            "email_hash",
            "notes",
            "updated_at",
        }
    ),
    "email_logs": frozenset(
        {
            "id",
            "tenant_id",
            "conference_id",
            "recipient_email",
            "recipient_email_hash",
            "error_message",
            "acknowledged",
            "acknowledged_at",
            "acknowledged_by",
        }
    ),
}
