"""Add invoice_events table for payment audit log and Stripe tracking fields.

Revision ID: 111
Revises: 110
Create Date: 2026-03-05
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "111"
down_revision = "110"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add Stripe tracking fields to invoices
    op.add_column(
        "invoices",
        sa.Column("stripe_payment_intent_id", sa.String(255), nullable=True),
    )
    op.add_column("invoices", sa.Column("stripe_charge_id", sa.String(255), nullable=True))
    op.add_column(
        "invoices",
        sa.Column("stripe_payment_link_url", sa.String(500), nullable=True),
    )

    op.create_index("idx_invoices_stripe_intent", "invoices", ["stripe_payment_intent_id"])

    # Create invoice_events table for audit logging
    op.create_table(
        "invoice_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "invoice_id",
            UUID(as_uuid=True),
            sa.ForeignKey("invoices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("stripe_object_id", sa.String(255), nullable=True),
        sa.Column("stripe_object_type", sa.String(50), nullable=True),
        sa.Column("stripe_idempotency_key", sa.String(255), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=True),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("user_email", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    op.create_index("idx_invoice_events_invoice", "invoice_events", ["invoice_id"])
    op.create_index("idx_invoice_events_stripe_object", "invoice_events", ["stripe_object_id"])
    op.create_index("idx_invoice_events_type", "invoice_events", ["event_type"])
    op.create_index("idx_invoice_events_created", "invoice_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("idx_invoice_events_created", table_name="invoice_events")
    op.drop_index("idx_invoice_events_type", table_name="invoice_events")
    op.drop_index("idx_invoice_events_stripe_object", table_name="invoice_events")
    op.drop_index("idx_invoice_events_invoice", table_name="invoice_events")
    op.drop_table("invoice_events")

    op.drop_index("idx_invoices_stripe_intent", table_name="invoices")
    op.drop_column("invoices", "stripe_payment_link_url")
    op.drop_column("invoices", "stripe_charge_id")
    op.drop_column("invoices", "stripe_payment_intent_id")
