"""add invoice procurement, payment method, and discount fields

Revision ID: 119
Revises: 118
Create Date: 2026-03-07 11:00:00.000000

Adds procurement_code, payment_method, and discount_code to invoices and billing_profiles
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "119"
down_revision = "118"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add procurement code, payment method, and discount code fields."""
    # Add procurement_code to invoices (captured from billing_profile at invoice creation)
    op.add_column("invoices", sa.Column("procurement_code", sa.String(100), nullable=True))

    # Add payment_method to billing_profiles and invoices
    op.add_column("billing_profiles", sa.Column("payment_method", sa.String(20), nullable=True))
    op.add_column("invoices", sa.Column("payment_method", sa.String(20), nullable=True))

    # Add discount_code to billing_profiles and invoices
    op.add_column("billing_profiles", sa.Column("discount_code", sa.String(50), nullable=True))
    op.add_column("invoices", sa.Column("discount_code", sa.String(50), nullable=True))
    op.add_column("invoices", sa.Column("discount_amount", sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    """Remove procurement code, payment method, and discount code fields."""
    op.drop_column("invoices", "discount_amount")
    op.drop_column("invoices", "discount_code")
    op.drop_column("billing_profiles", "discount_code")
    op.drop_column("invoices", "payment_method")
    op.drop_column("billing_profiles", "payment_method")
    op.drop_column("invoices", "procurement_code")
