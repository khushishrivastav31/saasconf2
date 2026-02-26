"""Discount code enhancements: rename name->description, add is_combinable, add period associations.

Revision ID: 097_discount_code_enhancements
Revises: 096_screen_overlay_image_url
Create Date: 2026-02-26
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "097_discount_code_enhancements"
down_revision = "096_screen_overlay_image_url"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Rename discount_codes.name -> description and widen to 200
    op.alter_column(
        "discount_codes",
        "name",
        new_column_name="description",
        type_=sa.String(200),
        existing_type=sa.String(100),
        existing_nullable=False,
    )

    # 2. Add is_combinable column
    op.add_column(
        "discount_codes",
        sa.Column("is_combinable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # 3. Create discount_code_periods junction table
    op.create_table(
        "discount_code_periods",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "discount_code_id",
            UUID(as_uuid=True),
            sa.ForeignKey("discount_codes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "booking_period_id",
            UUID(as_uuid=True),
            sa.ForeignKey("booking_periods.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_index("idx_discount_code_periods_tenant", "discount_code_periods", ["tenant_id"])
    op.create_index("idx_discount_code_periods_discount", "discount_code_periods", ["discount_code_id"])
    op.create_index("idx_discount_code_periods_period", "discount_code_periods", ["booking_period_id"])
    op.create_index(
        "uq_discount_code_period",
        "discount_code_periods",
        ["discount_code_id", "booking_period_id"],
        unique=True,
    )

    # Enable RLS
    op.execute("ALTER TABLE discount_code_periods ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON discount_code_periods
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON discount_code_periods")
    op.execute("ALTER TABLE discount_code_periods DISABLE ROW LEVEL SECURITY")
    op.drop_table("discount_code_periods")

    op.drop_column("discount_codes", "is_combinable")

    op.alter_column(
        "discount_codes",
        "description",
        new_column_name="name",
        type_=sa.String(100),
        existing_type=sa.String(200),
        existing_nullable=False,
    )
