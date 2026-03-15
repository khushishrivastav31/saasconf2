"""Create user_roles table.

Revision ID: 136
Revises: 135
Create Date: 2026-03-15
"""

import sqlalchemy as sa
from alembic import op

revision = "136"
down_revision = "135"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_roles",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_user_roles_tenant", "user_roles", ["tenant_id"])
    op.create_index("idx_user_roles_conference", "user_roles", ["conference_id"])
    op.create_index(
        "idx_user_roles_name",
        "user_roles",
        ["tenant_id", "conference_id", "name"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("idx_user_roles_name", table_name="user_roles")
    op.drop_index("idx_user_roles_conference", table_name="user_roles")
    op.drop_index("idx_user_roles_tenant", table_name="user_roles")
    op.drop_table("user_roles")
