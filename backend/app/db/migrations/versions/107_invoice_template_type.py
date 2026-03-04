"""Add template_type column to invoices table.

Supports multiple invoice templates per conference:
- bank_transfer (default, backward compatible)
- credit_card
- credit_note

Revision ID: 107
Revises: 106
Create Date: 2026-03-03
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = "107"
down_revision = "106_invoice_address_single_field"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "invoices",
        sa.Column(
            "template_type",
            sa.String(50),
            nullable=False,
            server_default="bank_transfer",
        ),
    )


def downgrade() -> None:
    op.drop_column("invoices", "template_type")
