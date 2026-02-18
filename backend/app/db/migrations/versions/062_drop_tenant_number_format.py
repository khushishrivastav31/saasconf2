"""Drop number formatting fields from tenants table.

Number formatting is now only at the conference level.

Revision ID: 062_drop_tenant_number_format
Revises: 061_conference_number_format
Create Date: 2025-02-11

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "062_drop_tenant_number_format"
down_revision = "061_conference_number_format"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("tenants", "decimal_separator")
    op.drop_column("tenants", "thousands_separator")
    op.drop_column("tenants", "currency_position")
    op.drop_column("tenants", "decimal_places")


def downgrade() -> None:
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
