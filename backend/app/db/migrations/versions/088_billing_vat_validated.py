"""Add vat_validated to billing_profiles.

Revision ID: 088_billing_vat_validated
Revises: 087_booking_option_day
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "088_billing_vat_validated"
down_revision: str = "087_booking_option_day"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "billing_profiles",
        sa.Column("vat_validated", sa.Boolean(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("billing_profiles", "vat_validated")
