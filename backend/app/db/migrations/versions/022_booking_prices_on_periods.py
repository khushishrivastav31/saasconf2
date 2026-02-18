"""Move prices and currency from booking_packages to booking_periods.

Revision ID: 022_booking_prices_on_periods
Revises: 021_booking_options
Create Date: 2026-01-27
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "022_booking_prices_on_periods"
down_revision = "021_booking_options"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add prices and currency to booking_periods
    op.add_column("booking_periods", sa.Column("prices", JSONB(), nullable=True))
    op.add_column("booking_periods", sa.Column("currency", sa.String(3), nullable=True))

    # Remove prices and currency from booking_packages
    op.drop_column("booking_packages", "prices")
    op.drop_column("booking_packages", "currency")


def downgrade() -> None:
    # Add prices and currency back to booking_packages
    op.add_column("booking_packages", sa.Column("currency", sa.String(3), nullable=True))
    op.add_column("booking_packages", sa.Column("prices", JSONB(), nullable=True))

    # Remove prices and currency from booking_periods
    op.drop_column("booking_periods", "currency")
    op.drop_column("booking_periods", "prices")
