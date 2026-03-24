"""Add placement_trainers table for assigning trainers to training placements.

Revision ID: 165
Revises: 164
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "165"
down_revision = "164"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "placement_trainers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "placement_id",
            UUID(as_uuid=True),
            sa.ForeignKey("program_year_trainings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "trainer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("trainers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("placement_id", "trainer_id", name="uq_placement_trainer"),
    )
    op.create_index("idx_pt_tenant", "placement_trainers", ["tenant_id"])
    op.create_index("idx_pt_placement", "placement_trainers", ["placement_id"])
    op.create_index("idx_pt_trainer", "placement_trainers", ["trainer_id"])

    # RLS
    op.execute("ALTER TABLE placement_trainers ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY placement_trainers_tenant_isolation ON placement_trainers
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS placement_trainers_tenant_isolation ON placement_trainers")
    op.execute("ALTER TABLE placement_trainers DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_pt_trainer", table_name="placement_trainers")
    op.drop_index("idx_pt_placement", table_name="placement_trainers")
    op.drop_index("idx_pt_tenant", table_name="placement_trainers")
    op.drop_table("placement_trainers")
