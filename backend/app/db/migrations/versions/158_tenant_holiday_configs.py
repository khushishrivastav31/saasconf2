"""Add tenant holiday configs and custom blocked days tables.

Revision ID: 158
Revises: 157
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "158"
down_revision = "157"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Holiday configs table
    op.create_table(
        "tenant_holiday_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("country_code", sa.String(2), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("national_holidays_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("regional_holidays_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("regional_code", sa.String(10), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "country_code", "year", name="uq_holiday_config_tenant_country_year"),
    )
    op.create_index("idx_thc_tenant", "tenant_holiday_configs", ["tenant_id"])

    op.execute("ALTER TABLE tenant_holiday_configs ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_holiday_configs_tenant_isolation ON tenant_holiday_configs
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
        """
    )

    # Custom blocked days table
    op.create_table(
        "custom_blocked_days",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("is_recurring", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "date", name="uq_blocked_day_tenant_date"),
    )
    op.create_index("idx_cbd_tenant_year", "custom_blocked_days", ["tenant_id", "year"])

    op.execute("ALTER TABLE custom_blocked_days ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY custom_blocked_days_tenant_isolation ON custom_blocked_days
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS custom_blocked_days_tenant_isolation ON custom_blocked_days")
    op.execute("ALTER TABLE custom_blocked_days DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_cbd_tenant_year", table_name="custom_blocked_days")
    op.drop_table("custom_blocked_days")

    op.execute("DROP POLICY IF EXISTS tenant_holiday_configs_tenant_isolation ON tenant_holiday_configs")
    op.execute("ALTER TABLE tenant_holiday_configs DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_thc_tenant", table_name="tenant_holiday_configs")
    op.drop_table("tenant_holiday_configs")
