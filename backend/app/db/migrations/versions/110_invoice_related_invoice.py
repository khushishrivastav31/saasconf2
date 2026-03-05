"""Add related_invoice_id self-FK to invoices table for credit note linking.

Revision ID: 110
Revises: 109
Create Date: 2026-03-05
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "110"
down_revision = "109"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "invoices",
        sa.Column("related_invoice_id", UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("idx_invoices_related", "invoices", ["related_invoice_id"])


def downgrade() -> None:
    op.drop_index("idx_invoices_related", table_name="invoices")
    op.drop_column("invoices", "related_invoice_id")
