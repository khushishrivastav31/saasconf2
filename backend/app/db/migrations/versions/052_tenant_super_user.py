"""Add super_user_id to tenants table.

Revision ID: 052_tenant_super_user
Revises: 051_user_conference_access
Create Date: 2026-02-09

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "052_tenant_super_user"
down_revision = "051_user_conference_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add super_user_id column to tenants table
    op.add_column(
        "tenants",
        sa.Column(
            "super_user_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )

    # Add foreign key constraint
    op.create_foreign_key(
        "fk_tenants_super_user_id",
        "tenants",
        "users",
        ["super_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Add index for super_user_id lookups
    op.create_index(
        "idx_tenants_super_user_id",
        "tenants",
        ["super_user_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_tenants_super_user_id", table_name="tenants")
    op.drop_constraint("fk_tenants_super_user_id", "tenants", type_="foreignkey")
    op.drop_column("tenants", "super_user_id")
