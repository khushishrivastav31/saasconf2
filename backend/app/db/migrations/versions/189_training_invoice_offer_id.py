"""Add offer_id to training_invoices.

Links training invoices to customer offers so invoices can be created
directly from accepted offers.

Revision ID: 189
Revises: 188
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "189"
down_revision = "188"


def upgrade() -> None:
    op.add_column(
        "training_invoices",
        sa.Column(
            "offer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("customer_offers.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_training_invoices_offer", "training_invoices", ["offer_id"])


def downgrade() -> None:
    op.drop_index("idx_training_invoices_offer", table_name="training_invoices")
    op.drop_column("training_invoices", "offer_id")
