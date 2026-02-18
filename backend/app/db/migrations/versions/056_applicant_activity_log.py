"""Add applicant activity log table.

Revision ID: 056_applicant_activity_log
Revises: 055_tenant_logo
Create Date: 2026-02-11
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "056_applicant_activity_log"
down_revision = "055_tenant_logo"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "applicant_activity_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "applicant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cfp_applicants.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("applicant_email", sa.String(255), nullable=False),
        sa.Column("applicant_first_name", sa.String(255), nullable=False),
        sa.Column("applicant_last_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("activity_type", sa.String(50), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Create indexes
    op.create_index(
        "idx_applicant_activity_tenant",
        "applicant_activity_logs",
        ["tenant_id"],
    )
    op.create_index(
        "idx_applicant_activity_applicant",
        "applicant_activity_logs",
        ["applicant_id"],
    )
    op.create_index(
        "idx_applicant_activity_created",
        "applicant_activity_logs",
        ["tenant_id", "created_at"],
    )
    op.create_index(
        "idx_applicant_activity_email",
        "applicant_activity_logs",
        ["tenant_id", "applicant_email"],
    )
    op.create_index(
        "idx_applicant_activity_type",
        "applicant_activity_logs",
        ["tenant_id", "activity_type"],
    )


def downgrade() -> None:
    op.drop_index("idx_applicant_activity_type", "applicant_activity_logs")
    op.drop_index("idx_applicant_activity_email", "applicant_activity_logs")
    op.drop_index("idx_applicant_activity_created", "applicant_activity_logs")
    op.drop_index("idx_applicant_activity_applicant", "applicant_activity_logs")
    op.drop_index("idx_applicant_activity_tenant", "applicant_activity_logs")
    op.drop_table("applicant_activity_logs")
