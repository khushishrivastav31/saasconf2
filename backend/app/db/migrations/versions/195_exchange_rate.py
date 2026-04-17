"""Tenant exchange rate history + invoice rate freeze (audit step 29).

Adds:
- ``exchange_rates`` table (history-preserving, tenant-scoped with RLS)
- ``invoices.exchange_rate_used`` column so issued invoices record the
  rate in effect at issue time, immune to later settings edits.

Revision ID: 195
Revises: 194
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "195"
down_revision = "194"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "exchange_rates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("from_ccy", sa.String(3), nullable=False),
        sa.Column("to_ccy", sa.String(3), nullable=False),
        sa.Column("rate", sa.Numeric(12, 6), nullable=False),
        sa.Column(
            "effective_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "idx_exchange_rates_lookup",
        "exchange_rates",
        ["tenant_id", "from_ccy", "to_ccy", "effective_at"],
    )

    op.execute("ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY")
    op.execute(
        """CREATE POLICY tenant_isolation_exchange_rates ON exchange_rates
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
               OR current_setting('app.is_super_admin', true) = 'true')"""
    )

    op.add_column(
        "invoices",
        sa.Column("exchange_rate_used", sa.Numeric(12, 6), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("invoices", "exchange_rate_used")
    op.execute("DROP POLICY IF EXISTS tenant_isolation_exchange_rates ON exchange_rates")
    op.execute("ALTER TABLE exchange_rates DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_exchange_rates_lookup", table_name="exchange_rates")
    op.drop_table("exchange_rates")
