"""Add discount_codes table.

Revision ID: 023_discount_codes
Revises: 022_booking_prices_on_periods
Create Date: 2026-01-27
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "023_discount_codes"
down_revision = "022_booking_prices_on_periods"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "discount_codes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True),
                  sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conference_id", UUID(as_uuid=True),
                  sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("discount_type", sa.String(10), nullable=False),
        sa.Column("discount_value", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("max_uses", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_discount_codes_tenant", "discount_codes", ["tenant_id"])
    op.create_index("idx_discount_codes_conference", "discount_codes", ["conference_id"])
    op.create_index(
        "idx_discount_codes_code", "discount_codes",
        ["tenant_id", "conference_id", "code"], unique=True,
    )

    # RLS policy for discount_codes
    op.execute("""
        ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;
    """)
    op.execute("""
        CREATE POLICY discount_codes_tenant_isolation ON discount_codes
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS discount_codes_tenant_isolation ON discount_codes;")
    op.drop_table("discount_codes")
