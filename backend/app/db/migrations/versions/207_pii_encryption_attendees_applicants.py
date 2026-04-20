"""Add encrypted PII columns for training_attendees + cfp_applicants.

Extends the 197/199 cutover to the two tables that were out of scope at the
time but still carry plaintext attendee/speaker PII today:

  - ``training_attendees.email`` — plaintext; ``email_hash`` already exists
    (synced via ``@validates``).
  - ``cfp_applicants.email`` — plaintext; ``email_hash`` already exists.
  - ``cfp_applicants.phone`` — plaintext; no hash column yet.

Additive-only migration: adds ``*_encrypted`` (Text, Fernet token) companion
columns and the missing ``phone_hash`` column + non-unique lookup index.
No writers change, no plaintext is touched.

Follow-up work (separate commits):
  1. Backfill script — fill in historical rows' ``*_encrypted`` + any missing
     ``*_hash`` from the current plaintext values.
  2. Model cutover — property-based accessors replace the plaintext columns
     (shape matches ``portal_user.py``).
  3. Drop plaintext columns + swap the legacy ``(tenant_id, email)`` unique
     constraint on ``training_attendees`` to ``(tenant_id, email_hash)``.

Revision ID: 207
Revises: 206
"""

import sqlalchemy as sa
from alembic import op

revision = "207"
down_revision = "206"
branch_labels = None
depends_on = None


# (table, column) pairs that get an ``<col>_encrypted`` companion column.
PII_COLUMNS: list[tuple[str, str]] = [
    ("training_attendees", "email"),
    ("cfp_applicants", "email"),
    ("cfp_applicants", "phone"),
]


def upgrade() -> None:
    for table, col in PII_COLUMNS:
        op.add_column(table, sa.Column(f"{col}_encrypted", sa.Text(), nullable=True))

    # ``email_hash`` already exists on both tables (migration 197-era work);
    # only add the missing ``phone_hash`` column for cfp_applicants.
    op.add_column("cfp_applicants", sa.Column("phone_hash", sa.String(64), nullable=True))
    op.create_index("ix_cfp_applicants_phone_hash", "cfp_applicants", ["phone_hash"])


def downgrade() -> None:
    op.drop_index("ix_cfp_applicants_phone_hash", table_name="cfp_applicants")
    op.drop_column("cfp_applicants", "phone_hash")

    for table, col in reversed(PII_COLUMNS):
        op.drop_column(table, f"{col}_encrypted")
