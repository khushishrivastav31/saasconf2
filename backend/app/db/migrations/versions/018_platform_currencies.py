"""Add platform_currencies table for global currency management.

Revision ID: 018_platform_currencies
Revises: 017_currencies
Create Date: 2026-01-27
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "018_platform_currencies"
down_revision = "017_currencies"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_currencies",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(3), nullable=False),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("symbol", sa.String(5), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("idx_platform_currencies_code", "platform_currencies", ["code"], unique=True)


def downgrade() -> None:
    op.drop_index("idx_platform_currencies_code", table_name="platform_currencies")
    op.drop_table("platform_currencies")
