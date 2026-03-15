"""Create user_role_assignments table.

Revision ID: 138
Revises: 137
Create Date: 2026-03-15
"""

import sqlalchemy as sa
from alembic import op

revision = "138"
down_revision = "137"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_role_assignments",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_role_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user_roles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "applicant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cfp_applicants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "assigned_by",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_role_id", "applicant_id", name="uq_user_role_assignment"),
    )

    op.create_index("idx_ura_tenant", "user_role_assignments", ["tenant_id"])
    op.create_index("idx_ura_role", "user_role_assignments", ["user_role_id"])
    op.create_index("idx_ura_applicant", "user_role_assignments", ["applicant_id"])


def downgrade() -> None:
    op.drop_index("idx_ura_applicant", table_name="user_role_assignments")
    op.drop_index("idx_ura_role", table_name="user_role_assignments")
    op.drop_index("idx_ura_tenant", table_name="user_role_assignments")
    op.drop_table("user_role_assignments")
