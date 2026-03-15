"""Add is_system column to user_roles.

Revision ID: 137
Revises: 136
Create Date: 2026-03-15
"""

import sqlalchemy as sa
from alembic import op

revision = "137"
down_revision = "136"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_roles",
        sa.Column("is_system", sa.Boolean, server_default="false", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("user_roles", "is_system")
