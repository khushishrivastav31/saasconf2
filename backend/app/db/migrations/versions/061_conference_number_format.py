"""Add number formatting fields to conferences table.

Revision ID: 061_conference_number_format
Revises: 060_tenant_number_format
Create Date: 2025-02-11

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "061_conference_number_format"
down_revision = "060_tenant_number_format"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Number formatting fields (nullable - inherit from tenant if not set)
    op.add_column(
        "conferences",
        sa.Column("decimal_separator", sa.String(1), nullable=True),
    )
    op.add_column(
        "conferences",
        sa.Column("thousands_separator", sa.String(1), nullable=True),
    )
    op.add_column(
        "conferences",
        sa.Column("currency_position", sa.String(10), nullable=True),
    )
    op.add_column(
        "conferences",
        sa.Column("decimal_places", sa.Integer(), nullable=True),
    )
    # Optional second currency for invoices
    op.add_column(
        "conferences",
        sa.Column("invoice_currency", sa.String(3), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conferences", "invoice_currency")
    op.drop_column("conferences", "decimal_places")
    op.drop_column("conferences", "currency_position")
    op.drop_column("conferences", "thousands_separator")
    op.drop_column("conferences", "decimal_separator")
