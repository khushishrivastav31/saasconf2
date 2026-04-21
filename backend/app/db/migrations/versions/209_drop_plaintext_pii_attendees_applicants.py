"""Drop plaintext PII columns on training_attendees + cfp_applicants.

Mirrors migration 199 for the two tables that were out of scope at the
time. After migration 207 added ``*_encrypted`` companion columns and the
backfill script populated historical rows, reads go through ``read_pii``
(decrypts the ``*_encrypted`` column) and lookups key on ``*_hash``. This
migration retires the plaintext columns for good.

Scope:
  - Drop ``training_attendees.email`` (NOT NULL plaintext) + swap the
    legacy ``(tenant_id, email)`` UNIQUE constraint to a unique index on
    ``(tenant_id, email_hash)``.
  - Drop ``cfp_applicants.email`` (NOT NULL plaintext) + ``cfp_applicants.phone``
    (nullable plaintext). No plaintext unique constraint on cfp_applicants.

Preconditions (verify on each environment before applying):
  1. ``PII_ENCRYPTION_KEY`` is configured and MultiFernet can decrypt all
     historical tokens.
  2. ``scripts/backfill_attendees_applicants_pii`` has been run — every
     row with a non-NULL plaintext also has a non-NULL ``*_encrypted`` +
     ``*_hash``. Otherwise the row becomes unreadable post-migration.
  3. Application code on the target environment is already phase 3:
     no ORM-level reads of the plaintext attribute, no lookups against
     the plaintext column.

Irreversible: ``downgrade()`` re-creates the columns + the legacy UNIQUE
constraint as NULLable, but CANNOT repopulate plaintext — operators must
restore from backup if they genuinely need plaintext back.

Revision ID: 209
Revises: 208
"""

import sqlalchemy as sa
from alembic import op

revision = "209"
down_revision = "208"
branch_labels = None
depends_on = None


# (table, column, original_nullable, original_length) — mirrors the plaintext
# columns added by migration 207 + earlier tables. ``original_*`` is only
# used to recreate the column on downgrade.
PII_COLUMNS: list[tuple[str, str, bool, int]] = [
    ("training_attendees", "email", False, 320),
    ("cfp_applicants", "email", False, 255),
    ("cfp_applicants", "phone", True, 50),
]


# Legacy (tenant_id, plaintext) UNIQUE constraint — superseded by the
# (tenant_id, email_hash) unique index created below.
LEGACY_UNIQUE_CONSTRAINT = "uq_training_attendees_tenant_email"
NEW_UNIQUE_INDEX = "uq_training_attendees_tenant_email_hash"


def upgrade() -> None:
    # Guard: abort if any row still has plaintext but missing *_encrypted —
    # that row would become unreadable.
    bind = op.get_bind()
    for table, col, _nullable, _length in PII_COLUMNS:
        unmigrated = bind.execute(
            sa.text(f"SELECT COUNT(*) FROM {table} WHERE {col} IS NOT NULL AND {col}_encrypted IS NULL")
        ).scalar_one()
        if unmigrated:
            raise RuntimeError(
                f"Refusing to drop {table}.{col}: {unmigrated} row(s) have plaintext "
                f"but no {col}_encrypted. Run scripts/backfill_attendees_applicants_pii first."
            )

    # Swap the legacy plaintext unique constraint on training_attendees for a
    # unique index keyed on email_hash. Do this before dropping the column.
    op.drop_constraint(LEGACY_UNIQUE_CONSTRAINT, "training_attendees", type_="unique")
    op.create_index(
        NEW_UNIQUE_INDEX,
        "training_attendees",
        ["tenant_id", "email_hash"],
        unique=True,
    )

    for table, col, _nullable, _length in PII_COLUMNS:
        op.drop_column(table, col)


def downgrade() -> None:
    # Recreate plaintext columns as NULLable regardless of original
    # constraint — historical plaintext is unrecoverable, so NOT NULL would
    # leave the table in an un-insertable state post-downgrade.
    for table, col, _nullable, length in PII_COLUMNS:
        op.add_column(table, sa.Column(col, sa.String(length), nullable=True))

    op.drop_index(NEW_UNIQUE_INDEX, table_name="training_attendees")
    op.create_unique_constraint(
        LEGACY_UNIQUE_CONSTRAINT,
        "training_attendees",
        ["tenant_id", "email"],
    )
