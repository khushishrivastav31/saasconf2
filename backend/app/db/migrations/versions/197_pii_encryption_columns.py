"""Add PII encrypted + hash columns (audit step 37, schema phase).

Infrastructure-only migration: adds ``*_encrypted`` (Text, Fernet token) and
``*_hash`` (String(64), SHA-256 hex) columns alongside the 13 plaintext PII
columns identified in the audit. No plaintext is touched; no data is written.

Follow-up work (separate commits):
  1. Dual-write layer — populate encrypted + hash on every insert/update.
  2. Backfill script — fill in historical rows.
  3. Read cutover — switch login/search queries to hash lookups and
     decrypt-on-read for display.
  4. Drop plaintext columns.

Unique-index strategy:
  ``users.email`` and ``portal_users.email`` have composite ``(tenant_id, email)``
  unique indexes today. Mirror those on ``(tenant_id, email_hash)`` so the
  uniqueness invariant survives the cutover. All other hash columns get plain
  non-unique indexes (search support only).

Revision ID: 197
Revises: 196
"""

import sqlalchemy as sa
from alembic import op

revision = "197"
down_revision = "196"
branch_labels = None
depends_on = None


# (table, column) pairs — 13 PII columns total.
PII_COLUMNS: list[tuple[str, str]] = [
    ("users", "email"),
    ("portal_users", "email"),
    ("portal_users", "phone"),
    ("invoices", "recipient_email"),
    ("invoices", "recipient_vat_number"),
    ("billing_profiles", "contact_email"),
    ("billing_profiles", "contact_phone"),
    ("billing_profiles", "vat_number"),
    ("trainers", "email"),
    ("trainers", "phone"),
    ("customers", "email"),
    ("customers", "phone"),
    ("customers", "vat_number"),
]


def _enc(col: str) -> str:
    return f"{col}_encrypted"


def _hash(col: str) -> str:
    return f"{col}_hash"


def _ix(table: str, col: str) -> str:
    return f"ix_{table}_{col}_hash"


def upgrade() -> None:
    for table, col in PII_COLUMNS:
        op.add_column(table, sa.Column(_enc(col), sa.Text(), nullable=True))
        op.add_column(table, sa.Column(_hash(col), sa.String(64), nullable=True))

    # Composite unique indexes mirroring existing (tenant_id, email) constraints.
    op.create_index(
        "ix_users_tenant_email_hash",
        "users",
        ["tenant_id", "email_hash"],
        unique=True,
    )
    op.create_index(
        "ix_portal_users_tenant_email_hash",
        "portal_users",
        ["tenant_id", "email_hash"],
        unique=True,
    )

    # Plain non-unique hash indexes for the remaining columns (search support).
    for table, col in PII_COLUMNS:
        if (table, col) in (("users", "email"), ("portal_users", "email")):
            continue
        op.create_index(_ix(table, col), table, [_hash(col)])


def downgrade() -> None:
    for table, col in reversed(PII_COLUMNS):
        if (table, col) in (("users", "email"), ("portal_users", "email")):
            continue
        op.drop_index(_ix(table, col), table_name=table)

    op.drop_index("ix_portal_users_tenant_email_hash", table_name="portal_users")
    op.drop_index("ix_users_tenant_email_hash", table_name="users")

    for table, col in reversed(PII_COLUMNS):
        op.drop_column(table, _hash(col))
        op.drop_column(table, _enc(col))
