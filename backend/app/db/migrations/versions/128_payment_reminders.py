"""Add payment_reminders table.

Tracks payment reminders sent for overdue invoices.
Each invoice can have up to 2 reminders (1st friendly, 2nd firm).

Revision ID: 128
Revises: 127
"""

import sqlalchemy as sa
from alembic import op

revision = "128"
down_revision = "127"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_reminders",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conference_id", sa.UUID(), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invoice_id", sa.UUID(), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reminder_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("recipient_name", sa.String(255), nullable=True),
        sa.Column("recipient_email", sa.String(255), nullable=True),
        sa.Column("invoice_number", sa.String(50), nullable=True),
        sa.Column("invoice_amount", sa.String(50), nullable=True),
        sa.Column("currency", sa.String(3), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("invoice_id", "reminder_number", name="uq_payment_reminder_invoice_number"),
    )

    op.create_index("idx_payment_reminders_tenant", "payment_reminders", ["tenant_id"])
    op.create_index(
        "idx_payment_reminders_conference",
        "payment_reminders",
        ["tenant_id", "conference_id", "status"],
    )
    op.create_index(
        "idx_payment_reminders_status_scheduled",
        "payment_reminders",
        ["status", "scheduled_date"],
    )
    op.create_index("idx_payment_reminders_invoice", "payment_reminders", ["invoice_id"])

    # RLS policy
    op.execute("ALTER TABLE payment_reminders ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON payment_reminders
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON payment_reminders")
    op.execute("ALTER TABLE payment_reminders DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_payment_reminders_invoice", table_name="payment_reminders")
    op.drop_index("idx_payment_reminders_status_scheduled", table_name="payment_reminders")
    op.drop_index("idx_payment_reminders_conference", table_name="payment_reminders")
    op.drop_index("idx_payment_reminders_tenant", table_name="payment_reminders")
    op.drop_table("payment_reminders")
