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
  2. Application code on the target environment is already phase 3:
     no ORM-level reads of the plaintext attribute, no lookups against
     the plaintext column.

This migration inlines the backfill previously shipped as
``scripts/backfill_attendees_applicants_pii``: any row with plaintext
but no ``*_encrypted`` companion is encrypted + hashed in-place before
the drop.  Idempotent — if phase 2.5 dual-writes already populated
every row, the backfill is a no-op.

Irreversible: ``downgrade()`` re-creates the columns + the legacy UNIQUE
constraint as NULLable, but CANNOT repopulate plaintext — operators must
restore from backup if they genuinely need plaintext back.

Revision ID: 209
Revises: 208
"""

import sqlalchemy as sa
from alembic import op

from app.core.security.pii_crypto import encrypt_pii, hash_email, hash_phone

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


def _backfill_column(bind: sa.Connection, table: str, col: str) -> int:
    """Encrypt + hash any row with plaintext but no ``<col>_encrypted``.

    Returns the number of rows written. Idempotent: only touches rows
    where the encrypted companion is still NULL.
    """
    rows = bind.execute(
        sa.text(f'SELECT id, "{col}" FROM "{table}" WHERE "{col}" IS NOT NULL AND "{col}_encrypted" IS NULL')
    ).all()
    if not rows:
        return 0
    hasher = hash_phone if col == "phone" else hash_email
    for row_id, plaintext in rows:
        bind.execute(
            sa.text(
                f'UPDATE "{table}" SET "{col}_encrypted" = :enc, '
                f'"{col}_hash" = COALESCE("{col}_hash", :hash) WHERE id = :id'
            ),
            {"enc": encrypt_pii(plaintext), "hash": hasher(plaintext), "id": row_id},
        )
    return len(rows)


def upgrade() -> None:
    bind = op.get_bind()

    # RLS bypass: the Alembic connection is not tenant-scoped, and the
    # backfill must reach every row across every tenant.
    bind.execute(sa.text("SELECT set_config('app.is_super_admin', 'true', true)"))

    # Inline backfill — populate *_encrypted + *_hash for any row that still
    # has plaintext without its companion. No-op if phase 2.5 dual-writes
    # already populated everything.
    for table, col, _nullable, _length in PII_COLUMNS:
        written = _backfill_column(bind, table, col)
        if written:
            print(f"[209] backfilled {written} row(s) on {table}.{col}")

    # Belt-and-suspenders guard: if backfill somehow missed a row, fail
    # loudly rather than losing data on the drop.
    for table, col, _nullable, _length in PII_COLUMNS:
        unmigrated = bind.execute(
            sa.text(f"SELECT COUNT(*) FROM {table} WHERE {col} IS NOT NULL AND {col}_encrypted IS NULL")
        ).scalar_one()
        if unmigrated:
            raise RuntimeError(
                f"Refusing to drop {table}.{col}: {unmigrated} row(s) still have plaintext "
                f"but no {col}_encrypted after inline backfill."
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
