"""Add invoice replacement tracking fields

Revision ID: 123
Revises: 122
Create Date: 2026-03-07 10:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "123"
down_revision = "122"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add replacement tracking fields to invoices table
    op.add_column("invoices", sa.Column("replaced_by_invoice_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("invoices", sa.Column("replaces_invoice_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("invoices", sa.Column("replacement_reason", sa.String(length=1000), nullable=True))

    # Add foreign key constraints
    op.create_foreign_key(
        "fk_invoices_replaced_by_invoice_id",
        "invoices",
        "invoices",
        ["replaced_by_invoice_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_invoices_replaces_invoice_id", "invoices", "invoices", ["replaces_invoice_id"], ["id"], ondelete="SET NULL"
    )

    # Add indexes for efficient lookups
    op.create_index("idx_invoices_replaced_by", "invoices", ["replaced_by_invoice_id"])
    op.create_index("idx_invoices_replaces", "invoices", ["replaces_invoice_id"])


def downgrade() -> None:
    # Drop indexes
    op.drop_index("idx_invoices_replaces", table_name="invoices")
    op.drop_index("idx_invoices_replaced_by", table_name="invoices")

    # Drop foreign keys
    op.drop_constraint("fk_invoices_replaces_invoice_id", "invoices", type_="foreignkey")
    op.drop_constraint("fk_invoices_replaced_by_invoice_id", "invoices", type_="foreignkey")

    # Drop columns
    op.drop_column("invoices", "replacement_reason")
    op.drop_column("invoices", "replaces_invoice_id")
    op.drop_column("invoices", "replaced_by_invoice_id")
