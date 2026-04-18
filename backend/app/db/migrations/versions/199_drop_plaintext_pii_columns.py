"""Drop plaintext PII columns + legacy unique indexes (step 37 phase f.2).

After phase (f.1) display reads go through ``read_pii`` / the model-level
property getters (which decrypt the ``*_encrypted`` companion column), and
phase (e) uniqueness + login lookups key on ``*_hash``. This migration
retires the plaintext columns for good.

Preconditions (verify on each environment before applying):
  1. ``PII_ENCRYPTION_KEY`` is configured and MultiFernet can decrypt all
     historical tokens.
  2. The backfill script (``scripts/backfill_pii_encryption``) has been
     run — every row with a non-NULL plaintext also has a non-NULL
     ``*_encrypted`` + ``*_hash``.  Otherwise the row becomes unreadable
     post-migration.
  3. Application code on the target environment is already phase (f.1):
     no ORM-level reads of the plaintext attribute, no ``ilike`` against
     the plaintext column.

Irreversible: ``downgrade()`` re-creates the columns + indexes as NULLable
but CANNOT repopulate plaintext — operators must restore from backup if
they genuinely need plaintext back.

Revision ID: 199
Revises: 198
"""

import sqlalchemy as sa
from alembic import op

revision = "199"
down_revision = "198"
branch_labels = None
depends_on = None


# (table, column, original_nullable, original_length) — mirrors migration 197's
# PII_COLUMNS list with type info needed to recreate on downgrade.
PII_COLUMNS: list[tuple[str, str, bool, int]] = [
    ("users", "email", False, 255),
    ("portal_users", "email", False, 255),
    ("portal_users", "phone", True, 50),
    ("invoices", "recipient_email", True, 255),
    ("invoices", "recipient_vat_number", True, 20),
    ("billing_profiles", "contact_email", False, 255),
    ("billing_profiles", "contact_phone", False, 50),
    ("billing_profiles", "vat_number", True, 50),
    ("trainers", "email", True, 255),
    ("trainers", "phone", True, 50),
    ("customers", "email", True, 255),
    ("customers", "phone", True, 50),
    ("customers", "vat_number", True, 50),
]


# Legacy (tenant_id, plaintext) unique indexes — superseded by the
# (tenant_id, email_hash) unique indexes created in migration 197.
LEGACY_UNIQUE_INDEXES: list[tuple[str, str]] = [
    ("idx_users_tenant_email", "users"),
    ("uq_portal_users_tenant_email", "portal_users"),
]


# Non-unique plaintext lookup index on users.email.
LEGACY_NONUNIQUE_INDEXES: list[tuple[str, str]] = [
    ("idx_users_email", "users"),
]


def upgrade() -> None:
    # Guard: abort if any row still has plaintext but missing *_encrypted —
    # that row would become unreadable.  Run this as a one-shot assertion.
    bind = op.get_bind()
    for table, col, _nullable, _length in PII_COLUMNS:
        unmigrated = bind.execute(
            sa.text(f"SELECT COUNT(*) FROM {table} WHERE {col} IS NOT NULL AND {col}_encrypted IS NULL")
        ).scalar_one()
        if unmigrated:
            raise RuntimeError(
                f"Refusing to drop {table}.{col}: {unmigrated} row(s) have plaintext "
                f"but no {col}_encrypted. Run scripts/backfill_pii_encryption first."
            )

    for index_name, table in LEGACY_NONUNIQUE_INDEXES:
        op.drop_index(index_name, table_name=table)

    for index_name, table in LEGACY_UNIQUE_INDEXES:
        op.drop_index(index_name, table_name=table)

    for table, col, _nullable, _length in PII_COLUMNS:
        op.drop_column(table, col)


def downgrade() -> None:
    # Recreate all plaintext columns as NULLable regardless of original
    # constraint — historical plaintext is unrecoverable, so NOT NULL would
    # leave the table in an un-insertable state post-downgrade.
    for table, col, _nullable, length in PII_COLUMNS:
        op.add_column(table, sa.Column(col, sa.String(length), nullable=True))

    for index_name, table in LEGACY_UNIQUE_INDEXES:
        op.create_index(index_name, table, ["tenant_id", "email"], unique=True)

    for index_name, table in LEGACY_NONUNIQUE_INDEXES:
        op.create_index(index_name, table, ["email"])
