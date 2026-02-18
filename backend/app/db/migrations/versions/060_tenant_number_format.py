"""Add number formatting fields to tenants table.

Revision ID: 060_tenant_number_format
Revises: 059_conference_currency
Create Date: 2025-02-11

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "060_tenant_number_format"
down_revision = "059_conference_currency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("decimal_separator", sa.String(1), nullable=False, server_default="."),
    )
    op.add_column(
        "tenants",
        sa.Column("thousands_separator", sa.String(1), nullable=False, server_default=","),
    )
    op.add_column(
        "tenants",
        sa.Column("currency_position", sa.String(10), nullable=False, server_default="before"),
    )
    op.add_column(
        "tenants",
        sa.Column("decimal_places", sa.Integer(), nullable=False, server_default="2"),
    )


def downgrade() -> None:
    op.drop_column("tenants", "decimal_places")
    op.drop_column("tenants", "currency_position")
    op.drop_column("tenants", "thousands_separator")
    op.drop_column("tenants", "decimal_separator")
