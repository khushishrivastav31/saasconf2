"""Export all data SaaSConf holds about a data subject (GDPR Art. 15).

Ops-only CLI. No HTTP interface in Phase 1 — this is the *subject data
collector* that Phase 2 will call from a background worker.

Usage::

    venv/bin/python -m scripts.export_subject_data \\
        --tenant <tenant_uuid> \\
        --email subject@example.com \\
        --email alt@example.com \\
        --out /tmp/subject-export.zip

Output ZIP layout::

    manifest.json       — summary + request metadata
    data/<model>.json   — rows per PII-owning table (one file per table)
    audit_log.json      — audit events scoped to any of the subject emails

``data/<model>.json`` is always written even if empty (makes the schema
of the export machine-verifiable).

Lookup is by ``email_hash`` — migration 200 backfilled that column on
every subject-identifying table, and the 6 encrypted tables have had
``email_hash`` since migration 197. The script never queries plaintext
email for matching, so it works whether the table still holds plaintext
(Registration, Alumni, etc.) or only ciphertext (User, PortalUser,
Invoice, BillingProfile, Trainer, Customer).
"""

from __future__ import annotations

import argparse
import asyncio
import io
import json
import sys
import uuid
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.core.security.pii_crypto import hash_email
from app.models.alumni import Alumni
from app.models.applicant_activity import ApplicantActivityLog
from app.models.audit import AuditLog
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


@dataclass(frozen=True)
class LookupSpec:
    """One table's email-hash lookup.

    ``model`` is the SQLAlchemy model, ``hash_attr`` is the attribute name
    on the model that holds the hash (e.g. ``"email_hash"`` or
    ``"contact_email_hash"``).
    """

    name: str
    model: type
    hash_attr: str


LOOKUPS: list[LookupSpec] = [
    LookupSpec("users", User, "email_hash"),
    LookupSpec("portal_users", PortalUser, "email_hash"),
    LookupSpec("invoices", Invoice, "recipient_email_hash"),
    LookupSpec("billing_profiles", BillingProfile, "contact_email_hash"),
    LookupSpec("trainers", Trainer, "email_hash"),
    LookupSpec("customers", Customer, "email_hash"),
    LookupSpec("registrations", Registration, "email_hash"),
    LookupSpec("cfp_applicants", CFPApplicant, "email_hash"),
    LookupSpec("training_attendees", TrainingAttendee, "email_hash"),
    LookupSpec("training_registrations", TrainingRegistration, "contact_email_hash"),
    LookupSpec("training_registration_attendees", TrainingRegistrationAttendee, "email_hash"),
    LookupSpec("offer_attendees", OfferAttendee, "email_hash"),
    LookupSpec("alumni", Alumni, "email_hash"),
    LookupSpec("email_logs", EmailLog, "recipient_email_hash"),
    LookupSpec("applicant_activity_logs", ApplicantActivityLog, "applicant_email_hash"),
]


def _serialize(value: Any) -> Any:
    """Convert a SQLAlchemy attribute value to JSON-safe form."""
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, set):
        return sorted(_serialize(v) for v in value)
    return value


def row_to_dict(row: Any) -> dict[str, Any]:
    """Dump a Mapped-column snapshot of *row* — no @property accessors.

    We want to capture what's physically stored. Property-based decryption
    is handled separately in the manifest note so the subject can verify
    what we hold vs. what we show.
    """
    out: dict[str, Any] = {}
    for col in row.__table__.columns:
        out[col.name] = _serialize(getattr(row, col.name))
    return out


async def collect_table(
    db: AsyncSession,
    spec: LookupSpec,
    tenant_id: uuid.UUID,
    email_hashes: list[str],
) -> list[dict[str, Any]]:
    hash_col = getattr(spec.model, spec.hash_attr)
    conditions: list[Any] = [hash_col.in_(email_hashes)]
    if hasattr(spec.model, "tenant_id"):
        conditions.append(spec.model.tenant_id == tenant_id)  # type: ignore[attr-defined]
    result: Any = await db.execute(select(spec.model).where(*conditions))
    return [row_to_dict(r) for r in result.scalars().all()]


async def collect_audit_log(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    email_hashes: list[str],
) -> list[dict[str, Any]]:
    result = await db.execute(
        select(AuditLog).where(
            AuditLog.tenant_id == tenant_id,
            AuditLog.subject_email_hash.in_(email_hashes),
        )
    )
    return [row_to_dict(r) for r in result.scalars().all()]


async def build_export(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    emails: list[str],
) -> bytes:
    """Collect every row for *emails* under *tenant_id* and return a ZIP blob."""
    email_hashes = [hash_email(e) for e in emails]

    sections: dict[str, list[dict[str, Any]]] = {}
    for spec in LOOKUPS:
        sections[spec.name] = await collect_table(db, spec, tenant_id, email_hashes)
    sections["audit_log"] = await collect_audit_log(db, tenant_id, email_hashes)

    manifest = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "tenant_id": str(tenant_id),
        "subjects": emails,
        "subject_email_hashes": email_hashes,
        "record_counts": {name: len(rows) for name, rows in sections.items()},
        "notes": [
            "Row snapshots reflect physical column storage (Mapped columns only).",
            "Encrypted columns appear as ciphertext; use the app to decrypt via the tenant's PII key.",
            "Hash columns are SHA-256(lower(trim(email))) — identifiers, not reversible.",
        ],
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, indent=2, default=str))
        for name, rows in sections.items():
            path = "audit_log.json" if name == "audit_log" else f"data/{name}.json"
            zf.writestr(path, json.dumps(rows, indent=2, default=str))
    return buf.getvalue()


async def main() -> None:
    parser = argparse.ArgumentParser(description="Export GDPR Art. 15 subject data for a tenant.")
    parser.add_argument("--tenant", required=True, help="Tenant UUID.")
    parser.add_argument(
        "--email",
        action="append",
        required=True,
        help="Subject email (may be repeated).",
    )
    parser.add_argument("--out", required=True, help="Output ZIP path.")
    args = parser.parse_args()

    tenant_id = uuid.UUID(args.tenant)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        blob = await build_export(db, tenant_id, args.email)

    out_path.write_bytes(blob)
    print(f"Wrote {len(blob):,} bytes to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
