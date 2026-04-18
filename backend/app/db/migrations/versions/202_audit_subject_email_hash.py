"""Add subject_email_hash column to audit_logs (GDPR phase 1).

Audit events that concern a specific data subject (``applicant.view``,
``registration.view``, ``invoice.view``, ``training_attendee.view``, etc.)
should record a lookup key so the Art. 15 export flow can collect
"every audit event about subject X" via an indexed hash match.

Nullable — most audit events are not subject-scoped (``user.login``,
``settings.update``, ``tenant.create``).

Revision ID: 202
Revises: 201
"""

import sqlalchemy as sa
from alembic import op

revision = "202"
down_revision = "201"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "audit_logs",
        sa.Column("subject_email_hash", sa.String(64), nullable=True),
    )
    op.create_index(
        "idx_audit_subject_email_hash",
        "audit_logs",
        ["subject_email_hash"],
    )


def downgrade() -> None:
    op.drop_index("idx_audit_subject_email_hash", table_name="audit_logs")
    op.drop_column("audit_logs", "subject_email_hash")
