"""Add po_number to training_registrations, training_invoices, and customer_offers.

Revision ID: 185
Revises: 184
"""

import sqlalchemy as sa
from alembic import op

revision = "185"
down_revision = "184"


def upgrade() -> None:
    op.add_column(
        "training_registrations",
        sa.Column("po_number", sa.String(100), nullable=True),
    )
    op.add_column(
        "training_invoices",
        sa.Column("po_number", sa.String(100), nullable=True),
    )
    op.add_column(
        "customer_offers",
        sa.Column("po_number", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("customer_offers", "po_number")
    op.drop_column("training_invoices", "po_number")
    op.drop_column("training_registrations", "po_number")
