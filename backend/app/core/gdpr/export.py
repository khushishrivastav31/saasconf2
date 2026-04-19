"""Subject-data export builder.

Shared between:
- the admin-facing ``POST /privacy-requests/{id}/generate-export`` endpoint
  (``mode="admin"`` — full column dump, admin reviews the ZIP before sending),
- the portal-facing self-serve ``POST /portal/me/privacy-requests``
  (``mode="portal"`` — strict allowlist; anything not listed in
  ``PORTAL_EXPORT_FIELDS`` is not exported),
- and the ops-only ``scripts/export_subject_data.py`` CLI (``mode="admin"``).

One code path, two rendering modes. The admin mode is unchanged from Phase 2;
the portal mode is new in Phase 4 and runs every row through
``_portal_row_to_dict`` which only emits fields in the allowlist.
"""

from __future__ import annotations

import io
import json
import uuid
import zipfile
from datetime import datetime
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.gdpr.lookups import (
    LOOKUPS,
    PORTAL_EXPORT_EXCLUDED_COLUMNS,
    PORTAL_EXPORT_FIELDS,
    LookupSpec,
)
from app.core.security.pii_crypto import hash_email
from app.models.audit import AuditLog

ExportMode = Literal["admin", "portal"]


def _serialize(value: Any) -> Any:
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, set):
        return sorted(_serialize(v) for v in value)
    return value


def _admin_row_to_dict(row: Any) -> dict[str, Any]:
    """Dump every physical Mapped column — admin mode."""
    out: dict[str, Any] = {}
    for col in row.__table__.columns:
        out[col.name] = _serialize(getattr(row, col.name))
    return out


def _portal_row_to_dict(row: Any, fields: frozenset[str]) -> dict[str, Any]:
    """Emit ONLY the fields in the allowlist — portal mode.

    Reads values via ``getattr`` so property accessors (e.g. ``row.email``
    decrypting the ``email_encrypted`` column) are used transparently.
    Silently drops a field that is missing on the row (defensive: a schema
    drift should fail the allowlist-coverage test at CI time, not leak an
    AttributeError into the user's download).
    """
    out: dict[str, Any] = {}
    for key in sorted(fields):
        if not hasattr(row, key):
            continue
        out[key] = _serialize(getattr(row, key))
    return out


async def _collect_table_admin(
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
    return [_admin_row_to_dict(r) for r in result.scalars().all()]


async def _collect_table_portal(
    db: AsyncSession,
    spec: LookupSpec,
    tenant_id: uuid.UUID,
    email_hashes: list[str],
    fields: frozenset[str],
) -> list[dict[str, Any]]:
    hash_col = getattr(spec.model, spec.hash_attr)
    conditions: list[Any] = [hash_col.in_(email_hashes)]
    if hasattr(spec.model, "tenant_id"):
        conditions.append(spec.model.tenant_id == tenant_id)  # type: ignore[attr-defined]
    result: Any = await db.execute(select(spec.model).where(*conditions))
    return [_portal_row_to_dict(r, fields) for r in result.scalars().all()]


async def _collect_audit_log(
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
    return [_admin_row_to_dict(r) for r in result.scalars().all()]


async def _collect_activity_summary(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    email_hashes: list[str],
) -> list[dict[str, Any]]:
    """Sanitised activity log for the portal export.

    Emits one row per privacy-related audit event the subject is entitled to
    see — timestamp + action name only. Staff user IDs, resource IDs, and
    raw details are dropped. Phase 4 scope: cover the privacy_request.*
    actions (the user's own request history) without leaking staff identity.
    """
    result = await db.execute(
        select(AuditLog)
        .where(
            AuditLog.tenant_id == tenant_id,
            AuditLog.subject_email_hash.in_(email_hashes),
            AuditLog.action.like("privacy_request.%"),
        )
        .order_by(AuditLog.created_at.asc())
    )
    return [
        {
            "at": row.created_at.isoformat() if row.created_at else None,
            "action": row.action,
        }
        for row in result.scalars().all()
    ]


async def build_export(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    emails: list[str],
    *,
    mode: ExportMode = "admin",
) -> tuple[bytes, dict[str, Any]]:
    """Collect every row for *emails* under *tenant_id* and return ``(zip_blob, manifest)``.

    ``mode="admin"`` dumps every physical column of every ``LOOKUPS`` table plus
    the full ``audit_log``. ``mode="portal"`` dumps only the subset of tables
    in ``PORTAL_EXPORT_FIELDS`` using only the allowlisted fields, and
    replaces ``audit_log`` with a sanitised ``activity_summary``.
    """
    email_hashes = [hash_email(e) for e in emails]

    sections: dict[str, list[dict[str, Any]]] = {}

    if mode == "admin":
        for spec in LOOKUPS:
            sections[spec.name] = await _collect_table_admin(db, spec, tenant_id, email_hashes)
        sections["audit_log"] = await _collect_audit_log(db, tenant_id, email_hashes)
        notes = [
            "Row snapshots reflect physical column storage (Mapped columns only).",
            "Encrypted columns appear as ciphertext; use the app to decrypt via the tenant's PII key.",
            "Hash columns are SHA-256(lower(trim(email))) — identifiers, not reversible.",
        ]
    else:  # portal
        for spec in LOOKUPS:
            fields = PORTAL_EXPORT_FIELDS.get(spec.name)
            if fields is None:
                # Table deliberately omitted from portal path (e.g.
                # applicant_activity_logs — staff audit trail).
                continue
            sections[spec.name] = await _collect_table_portal(db, spec, tenant_id, email_hashes, fields)
        sections["activity_summary"] = await _collect_activity_summary(db, tenant_id, email_hashes)
        notes = [
            "This export contains the personal data you provided plus events visible to you.",
            "Internal staff annotations, payment processor identifiers, and cryptographic columns are intentionally omitted.",
            "Contact the event organizer if you believe a field is missing from your export.",
        ]

    manifest: dict[str, Any] = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "tenant_id": str(tenant_id),
        "subjects": emails,
        "subject_email_hashes": email_hashes,
        "mode": mode,
        "record_counts": {name: len(rows) for name, rows in sections.items()},
        "notes": notes,
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, indent=2, default=str))
        for name, rows in sections.items():
            if name == "audit_log":
                path = "audit_log.json"
            elif name == "activity_summary":
                path = "activity_summary.json"
            else:
                path = f"data/{name}.json"
            zf.writestr(path, json.dumps(rows, indent=2, default=str))
    return buf.getvalue(), manifest


# Public helpers used by the schema-level guard test in test_gdpr_phase4.py.
__all__ = [
    "PORTAL_EXPORT_EXCLUDED_COLUMNS",
    "PORTAL_EXPORT_FIELDS",
    "ExportMode",
    "build_export",
]
