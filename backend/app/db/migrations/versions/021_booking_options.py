"""Add booking_periods and booking_packages tables.

Revision ID: 021_booking_options
Revises: 020_invoices
Create Date: 2026-01-27
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "021_booking_options"
down_revision = "020_invoices"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- booking_periods ---
    op.create_table(
        "booking_periods",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "conference_id", UUID(as_uuid=True), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_booking_periods_tenant", "booking_periods", ["tenant_id"])
    op.create_index("idx_booking_periods_conference", "booking_periods", ["conference_id"])
    op.create_index(
        "idx_booking_periods_name",
        "booking_periods",
        ["tenant_id", "conference_id", "name"],
        unique=True,
    )

    # RLS policy for booking_periods
    op.execute("""
        ALTER TABLE booking_periods ENABLE ROW LEVEL SECURITY;
    """)
    op.execute("""
        CREATE POLICY booking_periods_tenant_isolation ON booking_periods
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
    """)

    # --- booking_packages ---
    op.create_table(
        "booking_packages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "conference_id", UUID(as_uuid=True), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prices", JSONB(), nullable=True),
        sa.Column("currency", sa.String(3), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_booking_packages_tenant", "booking_packages", ["tenant_id"])
    op.create_index("idx_booking_packages_conference", "booking_packages", ["conference_id"])
    op.create_index(
        "idx_booking_packages_name",
        "booking_packages",
        ["tenant_id", "conference_id", "name"],
        unique=True,
    )

    # RLS policy for booking_packages
    op.execute("""
        ALTER TABLE booking_packages ENABLE ROW LEVEL SECURITY;
    """)
    op.execute("""
        CREATE POLICY booking_packages_tenant_isolation ON booking_packages
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS booking_packages_tenant_isolation ON booking_packages;")
    op.drop_table("booking_packages")
    op.execute("DROP POLICY IF EXISTS booking_periods_tenant_isolation ON booking_periods;")
    op.drop_table("booking_periods")
