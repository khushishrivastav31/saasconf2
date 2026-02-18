"""Add invoices table.

Revision ID: 020_invoices
Revises: 019_sponsors
Create Date: 2026-01-27
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "020_invoices"
down_revision = "019_sponsors"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "invoices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "conference_id", UUID(as_uuid=True), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
        ),
        # Invoice identification
        sa.Column("invoice_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        # Dates
        sa.Column("issue_date", sa.Date(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        # Recipient information
        sa.Column("recipient_name", sa.String(255), nullable=False),
        sa.Column("recipient_email", sa.String(255), nullable=True),
        sa.Column("recipient_address_line1", sa.String(255), nullable=True),
        sa.Column("recipient_address_line2", sa.String(255), nullable=True),
        sa.Column("recipient_city", sa.String(100), nullable=True),
        sa.Column("recipient_state", sa.String(100), nullable=True),
        sa.Column("recipient_postal_code", sa.String(20), nullable=True),
        sa.Column("recipient_country", sa.String(100), nullable=True),
        sa.Column("recipient_vat_number", sa.String(20), nullable=True),
        # Financial
        sa.Column("line_items", JSONB, nullable=True, server_default="[]"),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=True),
        sa.Column("tax_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("tax_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("total", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=True),
        # Notes
        sa.Column("notes", sa.Text(), nullable=True),
        # Contact persons
        sa.Column("contact_persons", JSONB, nullable=True, server_default="[]"),
        # Status
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        # Unique constraint
        sa.UniqueConstraint("tenant_id", "invoice_number", name="uq_invoices_tenant_number"),
    )

    op.create_index("idx_invoices_tenant", "invoices", ["tenant_id"])
    op.create_index("idx_invoices_conference", "invoices", ["tenant_id", "conference_id"])

    # Enable RLS
    op.execute("ALTER TABLE invoices ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY invoices_tenant_isolation ON invoices
        FOR ALL
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS invoices_tenant_isolation ON invoices")
    op.execute("ALTER TABLE invoices DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_invoices_conference", table_name="invoices")
    op.drop_index("idx_invoices_tenant", table_name="invoices")
    op.drop_table("invoices")
