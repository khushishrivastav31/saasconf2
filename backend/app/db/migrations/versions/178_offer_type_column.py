"""Add offer_type column to customer_offers.

Revision ID: 178
Revises: 177
"""

import sqlalchemy as sa
from alembic import op

revision = "178"
down_revision = "177"


def upgrade() -> None:
    op.add_column(
        "customer_offers",
        sa.Column("offer_type", sa.String(20), server_default="inhouse", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("customer_offers", "offer_type")
