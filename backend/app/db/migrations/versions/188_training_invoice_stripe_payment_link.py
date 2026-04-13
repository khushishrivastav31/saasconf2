"""Add stripe_payment_link_url and stripe_payment_link_id to training_invoices.

Stores the Stripe payment link ID (pl_xxx) directly on the invoice so we can
deactivate it without an event-log lookup (training invoices have no InvoiceEvent
model). The URL is stored for email / frontend display.

Revision ID: 188
Revises: 187
"""

import sqlalchemy as sa
from alembic import op

revision = "188"
down_revision = "187"


def upgrade() -> None:
    op.add_column(
        "training_invoices",
        sa.Column("stripe_payment_link_url", sa.String(500), nullable=True),
    )
    op.add_column(
        "training_invoices",
        sa.Column("stripe_payment_link_id", sa.String(255), nullable=True),
    )
    op.create_index(
        "idx_training_invoices_stripe_link",
        "training_invoices",
        ["stripe_payment_link_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_training_invoices_stripe_link", table_name="training_invoices")
    op.drop_column("training_invoices", "stripe_payment_link_id")
    op.drop_column("training_invoices", "stripe_payment_link_url")
