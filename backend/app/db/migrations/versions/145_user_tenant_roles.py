"""Add user_tenant_roles table for module-scoped access control.

Revision ID: 145
Revises: 144
Create Date: 2026-03-23

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "145"
down_revision: Union[str, None] = "144"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create user_tenant_roles table
    op.create_table(
        "user_tenant_roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scope", sa.String(50), nullable=False),
        sa.Column("level", sa.String(50), nullable=False),
        sa.Column("granted_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("granted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Indexes
    op.create_index("idx_user_tenant_roles_user", "user_tenant_roles", ["user_id"])
    op.create_index("idx_user_tenant_roles_unique", "user_tenant_roles", ["user_id", "scope"], unique=True)

    # Data migration: existing tenant_admin users → scope="all", level="admin"
    op.execute(
        """
        INSERT INTO user_tenant_roles (id, user_id, scope, level)
        SELECT uuid_generate_v4(), id, 'all', 'admin'
        FROM users
        WHERE role = 'tenant_admin' AND tenant_id IS NOT NULL
        """
    )

    # Data migration: existing super_user_id users → scope="all", level="super_user"
    # Upsert: if already inserted as admin above, upgrade to super_user
    op.execute(
        """
        INSERT INTO user_tenant_roles (id, user_id, scope, level)
        SELECT uuid_generate_v4(), t.super_user_id, 'all', 'super_user'
        FROM tenants t
        WHERE t.super_user_id IS NOT NULL
        ON CONFLICT (user_id, scope)
        DO UPDATE SET level = 'super_user'
        """
    )


def downgrade() -> None:
    op.drop_index("idx_user_tenant_roles_unique", table_name="user_tenant_roles")
    op.drop_index("idx_user_tenant_roles_user", table_name="user_tenant_roles")
    op.drop_table("user_tenant_roles")
