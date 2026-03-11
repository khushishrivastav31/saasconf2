"""Add expense_tiers table and expense_tier_id to speaker_expense_allowances.

Revision ID: 130
Revises: 129
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "130"
down_revision = "129"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create expense_tiers table
    op.create_table(
        "expense_tiers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("max_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="EUR"),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("conference_id", "name", name="uq_expense_tier_conference_name"),
    )
    op.create_index(
        "idx_expense_tiers_tenant_conf",
        "expense_tiers",
        ["tenant_id", "conference_id"],
    )

    # Add expense_tier_id column to speaker_expense_allowances
    op.add_column(
        "speaker_expense_allowances",
        sa.Column(
            "expense_tier_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("expense_tiers.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "idx_allowances_expense_tier",
        "speaker_expense_allowances",
        ["expense_tier_id"],
    )

    # RLS policy for expense_tiers
    op.execute(
        """
        ALTER TABLE expense_tiers ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS tenant_isolation ON expense_tiers;
        CREATE POLICY tenant_isolation ON expense_tiers
            USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON expense_tiers;")
    op.execute("ALTER TABLE expense_tiers DISABLE ROW LEVEL SECURITY;")
    op.drop_index("idx_allowances_expense_tier", table_name="speaker_expense_allowances")
    op.drop_column("speaker_expense_allowances", "expense_tier_id")
    op.drop_index("idx_expense_tiers_tenant_conf", table_name="expense_tiers")
    op.drop_table("expense_tiers")
