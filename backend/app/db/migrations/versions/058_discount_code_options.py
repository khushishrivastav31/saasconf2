"""Add discount_code_options join table.

Revision ID: 058_discount_code_options
Revises: 057_booking_options
Create Date: 2026-02-11
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "058_discount_code_options"
down_revision = "057_booking_options"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create the join table for discount codes and booking options
    op.create_table(
        "discount_code_options",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("discount_code_id", UUID(as_uuid=True), sa.ForeignKey("discount_codes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("booking_option_id", UUID(as_uuid=True), sa.ForeignKey("booking_options.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Create indexes
    op.create_index("idx_discount_code_options_tenant", "discount_code_options", ["tenant_id"])
    op.create_index("idx_discount_code_options_discount", "discount_code_options", ["discount_code_id"])
    op.create_index("idx_discount_code_options_option", "discount_code_options", ["booking_option_id"])

    # Unique constraint to prevent duplicate associations
    op.create_index(
        "uq_discount_code_option",
        "discount_code_options",
        ["discount_code_id", "booking_option_id"],
        unique=True,
    )

    # Enable RLS
    op.execute("ALTER TABLE discount_code_options ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY discount_code_options_tenant_isolation ON discount_code_options
        FOR ALL
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS discount_code_options_tenant_isolation ON discount_code_options")
    op.drop_index("uq_discount_code_option", table_name="discount_code_options")
    op.drop_index("idx_discount_code_options_option", table_name="discount_code_options")
    op.drop_index("idx_discount_code_options_discount", table_name="discount_code_options")
    op.drop_index("idx_discount_code_options_tenant", table_name="discount_code_options")
    op.drop_table("discount_code_options")
