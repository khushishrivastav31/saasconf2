"""Add related_invoice_id to training_invoices (for credit notes).

Revision ID: 186
Revises: 185
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "186"
down_revision = "185"


def upgrade() -> None:
    op.add_column(
        "training_invoices",
        sa.Column(
            "related_invoice_id",
            UUID(as_uuid=True),
            sa.ForeignKey("training_invoices.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "idx_training_invoices_related",
        "training_invoices",
        ["related_invoice_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_training_invoices_related", table_name="training_invoices")
    op.drop_column("training_invoices", "related_invoice_id")
