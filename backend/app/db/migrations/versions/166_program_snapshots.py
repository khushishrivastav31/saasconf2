"""Add program_snapshots table and published_version/published_at to training_program_years.

Revision ID: 166
Revises: 165
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "166"
down_revision = "165"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add published_version and published_at to training_program_years
    op.add_column(
        "training_program_years",
        sa.Column("published_version", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "training_program_years",
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Create program_snapshots table
    op.create_table(
        "program_snapshots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "program_year_id",
            UUID(as_uuid=True),
            sa.ForeignKey("training_program_years.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("snapshot_data", JSONB(), nullable=False),
        sa.Column(
            "published_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("program_year_id", "version", name="uq_snapshot_version"),
    )
    op.create_index("idx_ps_tenant", "program_snapshots", ["tenant_id"])
    op.create_index("idx_ps_program_year", "program_snapshots", ["program_year_id"])

    # RLS
    op.execute("ALTER TABLE program_snapshots ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY program_snapshots_tenant_isolation ON program_snapshots
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS program_snapshots_tenant_isolation ON program_snapshots")
    op.execute("ALTER TABLE program_snapshots DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_ps_program_year", table_name="program_snapshots")
    op.drop_index("idx_ps_tenant", table_name="program_snapshots")
    op.drop_table("program_snapshots")

    op.drop_column("training_program_years", "published_at")
    op.drop_column("training_program_years", "published_version")
