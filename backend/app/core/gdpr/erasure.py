"""GDPR Art. 17 erasure service.

Two entry points:

* :func:`build_preview` — read-only; enumerates the 15 PII-owning tables
  for a given subject and returns per-table row IDs, default erasure
  action, allowed overrides, and a locked-reason when the admin cannot
  override (invoices under HGB §257).
* :func:`execute_erasure` — validates the admin's chosen actions against
  what the preview allowed, writes the audit log inside the transaction
  (so rollback removes the audit entry too), then deletes or anonymises
  rows in dependency order. Returns a manifest of what was done.

Anonymisation overwrites the email hash + encrypted email columns with
``NULL``, sets ``first_name`` to ``"Erased"`` and ``last_name`` to
``"Subject"`` (sentinel values that make the row identifiable as
anonymised) and clears any other PII-shaped columns on the model. The
row itself and its foreign-key relationships survive so downstream
records (invoices, training placements) remain internally consistent.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.gdpr.lookups import LOOKUPS, LOOKUPS_BY_NAME, ErasureAction, LookupSpec
from app.models.invoice import Invoice

# --------------------------------------------------------------------------- #
# Per-model anonymisation recipes                                             #
# --------------------------------------------------------------------------- #
#
# Maps table name → dict of {column_name: new_value}. Applied via bulk
# ``UPDATE`` keyed on ``id.in_(row_ids)``. Sentinel strings
# ``first_name="Erased"``, ``last_name="Subject"`` make anonymised rows
# trivially identifiable. Columns not listed here are left untouched.

_ANONYMISE_RECIPES: dict[str, dict[str, Any]] = {
    "users": {
        "email_encrypted": None,
        "email_hash": None,
        "first_name": "Erased",
        "last_name": "Subject",
        "pronouns": None,
        "is_active": False,
    },
    "portal_users": {
        "email_encrypted": None,
        "email_hash": None,
        "phone_encrypted": None,
        "phone_hash": None,
        "first_name": "Erased",
        "last_name": "Subject",
        "pronouns": None,
        "title": None,
        "company": None,
        "bio": None,
        "social_links": {},
        "address_line_1": None,
        "address_line_2": None,
        "city": None,
        "postal_code": None,
        "country": None,
        "is_active": False,
    },
    "trainers": {
        "email_encrypted": None,
        "email_hash": None,
        "phone_encrypted": None,
        "phone_hash": None,
        "first_name": "Erased",
        "last_name": "Subject",
        "pronouns": None,
        "vita": None,
        "is_active": False,
    },
    "customers": {
        "email_encrypted": None,
        "email_hash": None,
        "phone_encrypted": None,
        "phone_hash": None,
        "vat_number_encrypted": None,
        "vat_number_hash": None,
        "contact_person": None,
        "address_line1": None,
        "address_line2": None,
        "city": None,
        "state": None,
        "postal_code": None,
        "country": None,
        "contact_persons": [],
        "comments": None,
        "notes": None,
        "is_active": False,
    },
    "billing_profiles": {
        "contact_email_encrypted": None,
        "contact_email_hash": None,
        "contact_phone_encrypted": None,
        "contact_phone_hash": None,
        "vat_number_encrypted": None,
        "vat_number_hash": None,
        "contact_first_name": "Erased",
        "contact_last_name": "Subject",
    },
}


# --------------------------------------------------------------------------- #
# Preview                                                                     #
# --------------------------------------------------------------------------- #


@dataclass
class ErasureTableEntry:
    """One row in the preview output."""

    table: str
    count: int
    row_ids: list[uuid.UUID]
    default_action: ErasureAction
    allowed_actions: list[ErasureAction]
    locked_reason: str | None


@dataclass
class ErasurePreview:
    entries: list[ErasureTableEntry]
    summary: dict[str, int]


async def _collect_ids(
    db: AsyncSession,
    spec: LookupSpec,
    tenant_id: uuid.UUID,
    email_hashes: list[str],
) -> list[uuid.UUID]:
    hash_col = getattr(spec.model, spec.hash_attr)
    conditions: list[Any] = [hash_col.in_(email_hashes)]
    if hasattr(spec.model, "tenant_id"):
        conditions.append(spec.model.tenant_id == tenant_id)
    id_col: Any = spec.model.id  # type: ignore[attr-defined]
    result = await db.execute(select(id_col).where(*conditions))
    return [row for (row,) in result.all()]


async def _subject_has_retained_invoices(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    email_hashes: list[str],
) -> bool:
    result = await db.execute(
        select(Invoice.id).where(
            Invoice.tenant_id == tenant_id,
            Invoice.recipient_email_hash.in_(email_hashes),
        )
    )
    return result.first() is not None


async def build_preview(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    email_hashes: list[str],
) -> ErasurePreview:
    """Enumerate every table that has rows for *email_hashes* under *tenant_id*."""
    retained = await _subject_has_retained_invoices(db, tenant_id, email_hashes)

    entries: list[ErasureTableEntry] = []
    for spec in LOOKUPS:
        row_ids = await _collect_ids(db, spec, tenant_id, email_hashes)
        default_action = spec.erasure_default
        allowed_actions = set(spec.allowed_actions)
        locked_reason = spec.locked_reason

        if spec.name == "billing_profiles" and retained:
            # A linked invoice is retained — the billing profile's PII is part
            # of the retention chain and must be preserved with the invoice.
            default_action = "skip"
            allowed_actions = {"skip"}
            locked_reason = "Linked invoice is retained under HGB §257"

        entries.append(
            ErasureTableEntry(
                table=spec.name,
                count=len(row_ids),
                row_ids=row_ids,
                default_action=default_action,
                allowed_actions=sorted(allowed_actions),
                locked_reason=locked_reason,
            )
        )

    summary = {
        "to_delete": sum(e.count for e in entries if e.default_action == "delete"),
        "to_anonymize": sum(e.count for e in entries if e.default_action == "anonymize"),
        "to_skip": sum(e.count for e in entries if e.default_action == "skip"),
    }
    return ErasurePreview(entries=entries, summary=summary)


# --------------------------------------------------------------------------- #
# Execute                                                                     #
# --------------------------------------------------------------------------- #


@dataclass
class ErasureManifestEntry:
    action: ErasureAction
    affected: int


@dataclass
class ErasureManifest:
    entries: dict[str, ErasureManifestEntry]

    def to_dict(self) -> dict[str, dict[str, Any]]:
        return {k: {"action": v.action, "affected": v.affected} for k, v in self.entries.items()}


def _validate_actions(
    preview: ErasurePreview,
    actions: dict[str, str],
) -> dict[str, ErasureAction]:
    """Ensure every supplied action is legal for its table."""
    resolved: dict[str, ErasureAction] = {}
    preview_by_table = {e.table: e for e in preview.entries}

    for table, action in actions.items():
        if table not in preview_by_table:
            raise ValueError(f"Unknown table: {table}")
        entry = preview_by_table[table]
        if action not in entry.allowed_actions:
            raise ValueError(
                f"Action '{action}' not allowed for table '{table}'. Allowed: {sorted(entry.allowed_actions)}"
            )
        resolved[table] = action  # type: ignore[assignment]

    # Tables omitted from the payload default to the preview's default action.
    for entry in preview.entries:
        resolved.setdefault(entry.table, entry.default_action)

    return resolved


def _anonymise_statement(spec: LookupSpec, row_ids: list[uuid.UUID]) -> Any:
    recipe = _ANONYMISE_RECIPES.get(spec.name)
    if recipe is None:
        raise ValueError(f"No anonymisation recipe for table '{spec.name}'")
    id_col: Any = spec.model.id  # type: ignore[attr-defined]
    return update(spec.model).where(id_col.in_(row_ids)).values(**recipe)


def _delete_statement(spec: LookupSpec, row_ids: list[uuid.UUID]) -> Any:
    id_col: Any = spec.model.id  # type: ignore[attr-defined]
    return delete(spec.model).where(id_col.in_(row_ids))


# Tables in dependency order (children before parents) so explicit deletes
# don't violate FK constraints before a cascade can kick in. Tables not in
# this list fall back to LOOKUPS order.
_DELETE_ORDER: list[str] = [
    "applicant_activity_logs",
    "email_logs",
    "offer_attendees",
    "training_registration_attendees",
    "training_registrations",
    "training_attendees",
    "registrations",
    "alumni",
    "cfp_applicants",
    "billing_profiles",
    "customers",
    "trainers",
    "portal_users",
    "users",
    "invoices",
]


def _ordered_specs() -> list[LookupSpec]:
    seen: set[str] = set()
    ordered: list[LookupSpec] = []
    for name in _DELETE_ORDER:
        if name in LOOKUPS_BY_NAME:
            ordered.append(LOOKUPS_BY_NAME[name])
            seen.add(name)
    for spec in LOOKUPS:
        if spec.name not in seen:
            ordered.append(spec)
    return ordered


async def execute_erasure(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    email_hashes: list[str],
    actions: dict[str, str],
    preview: ErasurePreview | None = None,
) -> ErasureManifest:
    """Run the chosen erasure actions.

    Caller owns the transaction (for rollback-on-error); this function does
    not call ``commit()``. Pass an optional *preview* to skip re-collection;
    otherwise one is built fresh.
    """
    if preview is None:
        preview = await build_preview(db, tenant_id, email_hashes)

    resolved = _validate_actions(preview, actions)
    preview_by_table = {e.table: e for e in preview.entries}

    manifest_entries: dict[str, ErasureManifestEntry] = {}

    # Anonymise first (updates), then delete (in dependency order) — an update
    # on a row we're about to delete is wasted but harmless; whereas deleting
    # first could break a parent row another table still needs.
    for spec in _ordered_specs():
        entry = preview_by_table[spec.name]
        action: ErasureAction = resolved.get(spec.name, entry.default_action)
        if action != "anonymize" or not entry.row_ids:
            continue
        await db.execute(_anonymise_statement(spec, entry.row_ids))
        manifest_entries[spec.name] = ErasureManifestEntry(action=action, affected=len(entry.row_ids))

    for spec in _ordered_specs():
        entry = preview_by_table[spec.name]
        action = resolved.get(spec.name, entry.default_action)
        if action != "delete" or not entry.row_ids:
            continue
        await db.execute(_delete_statement(spec, entry.row_ids))
        manifest_entries[spec.name] = ErasureManifestEntry(action=action, affected=len(entry.row_ids))

    for spec in LOOKUPS:
        entry = preview_by_table[spec.name]
        action = resolved.get(spec.name, entry.default_action)
        if spec.name in manifest_entries:
            continue
        manifest_entries[spec.name] = ErasureManifestEntry(action=action, affected=0)

    return ErasureManifest(entries=manifest_entries)
