"""Drop conference_vat_rates table

Revision ID: 116
Revises: 115
Create Date: 2026-03-06
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "116"
down_revision = "115"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop RLS policy first
    op.execute("DROP POLICY IF EXISTS tenant_isolation_conference_vat_rates ON conference_vat_rates")

    # Drop table (CASCADE will drop foreign keys)
    op.drop_table("conference_vat_rates")


def downgrade() -> None:
    # Recreate conference_vat_rates table
    op.create_table(
        "conference_vat_rates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("conference_id", UUID(as_uuid=True), nullable=False),
        sa.Column("rate", sa.Numeric(5, 2), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_foreign_key(
        "fk_conference_vat_rates_tenant_id",
        "conference_vat_rates",
        "tenants",
        ["tenant_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_foreign_key(
        "fk_conference_vat_rates_conference_id",
        "conference_vat_rates",
        "conferences",
        ["conference_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_index("idx_vat_rates_tenant", "conference_vat_rates", ["tenant_id"])
    op.create_index("idx_vat_rates_conference", "conference_vat_rates", ["tenant_id", "conference_id"])

    # Recreate RLS
    op.execute("ALTER TABLE conference_vat_rates ENABLE ROW LEVEL SECURITY")
    op.execute(
        """CREATE POLICY tenant_isolation_conference_vat_rates ON conference_vat_rates
        USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::uuid)"""
    )
