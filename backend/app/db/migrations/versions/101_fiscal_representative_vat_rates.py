"""Add fiscal representative and conference VAT rates.

Creates tables for managing fiscal representatives (tax representation
for conferences in foreign countries) and VAT rate periods that can
change over time.

Revision ID: 101_fiscal_rep_vat_rates
Revises: 100_volunteer_task_system
Create Date: 2026-02-27
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "101_fiscal_rep_vat_rates"
down_revision: Union[str, None] = "100_volunteer_task_system"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create fiscal_representatives (one per conference)
    op.create_table(
        "fiscal_representatives",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Company info
        sa.Column("company_name", sa.String(255), nullable=False),
        sa.Column("address_line1", sa.String(255), nullable=True),
        sa.Column("address_line2", sa.String(255), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("state", sa.String(100), nullable=True),
        sa.Column("postal_code", sa.String(20), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        # Contact
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("website", sa.String(500), nullable=True),
        # VAT numbers
        sa.Column("vat_number", sa.String(50), nullable=True),
        sa.Column("conference_vat_number", sa.String(50), nullable=True),
        # Contact persons (JSONB array)
        sa.Column("contact_persons", sa.dialects.postgresql.JSONB, nullable=True),
        # Status
        sa.Column("is_active", sa.Boolean, server_default="true", nullable=False),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        # Constraints
        sa.UniqueConstraint("tenant_id", "conference_id", name="uq_fiscal_reps_tenant_conference"),
    )
    op.create_index("idx_fiscal_reps_tenant", "fiscal_representatives", ["tenant_id"])
    op.create_index("idx_fiscal_reps_conference", "fiscal_representatives", ["tenant_id", "conference_id"])

    # RLS for fiscal_representatives
    op.execute("ALTER TABLE fiscal_representatives ENABLE ROW LEVEL SECURITY")
    op.execute(
        """CREATE POLICY tenant_isolation_fiscal_representatives ON fiscal_representatives
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
               OR current_setting('app.is_super_admin', true) = 'true')"""
    )

    # 2. Create conference_vat_rates (multiple per conference with date periods)
    op.create_table(
        "conference_vat_rates",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("idx_vat_rates_tenant", "conference_vat_rates", ["tenant_id"])
    op.create_index("idx_vat_rates_conference", "conference_vat_rates", ["tenant_id", "conference_id"])

    # RLS for conference_vat_rates
    op.execute("ALTER TABLE conference_vat_rates ENABLE ROW LEVEL SECURITY")
    op.execute(
        """CREATE POLICY tenant_isolation_conference_vat_rates ON conference_vat_rates
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
               OR current_setting('app.is_super_admin', true) = 'true')"""
    )


def downgrade() -> None:
    op.drop_table("conference_vat_rates")
    op.drop_table("fiscal_representatives")
