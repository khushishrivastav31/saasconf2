"""Add email_hash lookup columns to 9 subject-identifying tables (GDPR phase 1).

Part of the GDPR Art. 15 / 17 foundation work. These tables hold plaintext
email identifiers (Registration attendees, CFP applicants, training attendees,
email failure logs, alumni, etc.) but no hashed companion — meaning there's no
O(log n) lookup for "all rows matching this email." That prevents a clean
subject-data collector and forces full-table scans with ``ilike``.

This migration adds ``<plaintext>_hash`` columns (SHA-256 of lowercased +
trimmed email, matching ``app.core.security.pii_crypto.hash_email``) and
backfills them using pgcrypto's ``digest()`` so the SQL matches the Python
hash byte-for-byte. An index on each new column makes the lookup cheap.

Scope is *hash only* — the plaintext columns stay as-is (encryption of the
full 19 unencrypted PII tables is a separate future initiative, not a GDPR
blocker per the plan in ``.claude/plans/gdpr-art-15-17-flows.md``).

Revision ID: 200
Revises: 199
"""

import sqlalchemy as sa
from alembic import op

revision = "200"
down_revision = "199"
branch_labels = None
depends_on = None


# (table, plaintext_column, hash_column, plaintext_is_nullable)
EMAIL_HASH_SPEC: list[tuple[str, str, str, bool]] = [
    ("registrations", "email", "email_hash", False),
    ("cfp_applicants", "email", "email_hash", False),
    ("training_attendees", "email", "email_hash", False),
    ("training_registrations", "contact_email", "contact_email_hash", False),
    ("training_registration_attendees", "email", "email_hash", False),
    ("offer_attendees", "email", "email_hash", True),
    ("alumni", "email", "email_hash", False),
    ("email_logs", "recipient_email", "recipient_email_hash", False),
    ("applicant_activity_logs", "applicant_email", "applicant_email_hash", False),
]


def upgrade() -> None:
    for table, _plaintext_col, hash_col, _nullable in EMAIL_HASH_SPEC:
        op.add_column(table, sa.Column(hash_col, sa.String(64), nullable=True))

    bind = op.get_bind()
    for table, plaintext_col, hash_col, nullable in EMAIL_HASH_SPEC:
        where = f"WHERE {plaintext_col} IS NOT NULL" if nullable else ""
        bind.execute(
            sa.text(
                f"UPDATE {table} SET {hash_col} = encode(digest(lower(trim({plaintext_col})), 'sha256'), 'hex') {where}"
            )
        )

    for table, _plaintext_col, hash_col, _nullable in EMAIL_HASH_SPEC:
        op.create_index(f"idx_{table}_{hash_col}", table, [hash_col])


def downgrade() -> None:
    for table, _plaintext_col, hash_col, _nullable in EMAIL_HASH_SPEC:
        op.drop_index(f"idx_{table}_{hash_col}", table_name=table)
        op.drop_column(table, hash_col)
