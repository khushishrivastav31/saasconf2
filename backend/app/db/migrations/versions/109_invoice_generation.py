"""Invoice generation workflow enhancements.

Make invoice_number nullable (drafts have no number until generated),
add recipient source tracking (type + ID for auto-fill from sponsors,
speakers, etc.), and add internal_comment field (admin-only, not on PDF).

Revision ID: 109
Revises: 108
Create Date: 2026-03-04
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision = "109"
down_revision = "108"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Make invoice_number nullable
    op.alter_column("invoices", "invoice_number", existing_type=sa.String(50), nullable=True)

    # 2. Replace unique constraint with partial unique index
    #    (allows multiple NULLs for drafts, enforces uniqueness for assigned numbers)
    op.drop_constraint("uq_invoices_tenant_number", "invoices", type_="unique")
    op.execute(
        "CREATE UNIQUE INDEX uq_invoices_tenant_number "
        "ON invoices (tenant_id, invoice_number) "
        "WHERE invoice_number IS NOT NULL"
    )

    # 3. Add recipient source tracking
    op.add_column("invoices", sa.Column("recipient_source_type", sa.String(30), nullable=True))
    op.add_column("invoices", sa.Column("recipient_source_id", UUID(as_uuid=True), nullable=True))

    # 4. Add internal comment (admin-only, never shown on PDF)
    op.add_column("invoices", sa.Column("internal_comment", sa.Text(), nullable=True))


def downgrade() -> None:
    # Remove new columns
    op.drop_column("invoices", "internal_comment")
    op.drop_column("invoices", "recipient_source_id")
    op.drop_column("invoices", "recipient_source_type")

    # Restore original unique constraint
    op.execute("DROP INDEX IF EXISTS uq_invoices_tenant_number")

    # Set any NULL invoice_numbers to a placeholder before adding NOT NULL
    op.execute("UPDATE invoices SET invoice_number = 'DRAFT-' || id WHERE invoice_number IS NULL")
    op.alter_column("invoices", "invoice_number", existing_type=sa.String(50), nullable=False)
    op.create_unique_constraint("uq_invoices_tenant_number", "invoices", ["tenant_id", "invoice_number"])
