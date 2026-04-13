"""Create training_invoices table.

Revision ID: 184
Revises: 183
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "184"
down_revision = "183"


def upgrade() -> None:
    op.create_table(
        "training_invoices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "training_registration_id",
            UUID(as_uuid=True),
            sa.ForeignKey("training_registrations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Identification
        sa.Column("invoice_number", sa.String(50), nullable=True),
        sa.Column("template_type", sa.String(50), nullable=False, server_default="bank_transfer"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        # Dates
        sa.Column("issue_date", sa.Date, nullable=True),
        sa.Column("due_date", sa.Date, nullable=True),
        # Recipient
        sa.Column("recipient_name", sa.String(255), nullable=False),
        sa.Column("recipient_email", sa.String(255), nullable=True),
        sa.Column("recipient_address_line1", sa.String(255), nullable=True),
        sa.Column("recipient_city", sa.String(100), nullable=True),
        sa.Column("recipient_postal_code", sa.String(20), nullable=True),
        sa.Column("recipient_country", sa.String(100), nullable=True),
        sa.Column("recipient_vat_number", sa.String(50), nullable=True),
        # Payment
        sa.Column("payment_method", sa.String(20), nullable=True),
        sa.Column("stripe_payment_intent_id", sa.String(255), nullable=True),
        # Financial
        sa.Column("line_items", JSONB, nullable=True),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=True),
        sa.Column("tax_rate", sa.Numeric(5, 2), nullable=True),
        sa.Column("tax_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("total", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=True),
        # Notes & language
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("language", sa.String(5), nullable=False, server_default="en"),
        # Status
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Indexes
    op.create_index("idx_training_invoices_tenant", "training_invoices", ["tenant_id"])
    op.create_index("idx_training_invoices_registration", "training_invoices", ["training_registration_id"])
    op.create_index("idx_training_invoices_status", "training_invoices", ["status"])
    op.create_index("idx_training_invoices_stripe", "training_invoices", ["stripe_payment_intent_id"])
    op.create_index(
        "uq_training_invoices_tenant_number",
        "training_invoices",
        ["tenant_id", "invoice_number"],
        unique=True,
        postgresql_where=sa.text("invoice_number IS NOT NULL"),
    )

    # RLS policy
    op.execute("""
        ALTER TABLE training_invoices ENABLE ROW LEVEL SECURITY;
    """)
    op.execute("""
        CREATE POLICY training_invoices_tenant_isolation ON training_invoices
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS training_invoices_tenant_isolation ON training_invoices")
    op.execute("ALTER TABLE training_invoices DISABLE ROW LEVEL SECURITY")
    op.drop_table("training_invoices")
