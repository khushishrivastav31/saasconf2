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
