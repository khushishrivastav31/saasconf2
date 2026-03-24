"""Add program_year_trainings table for scheduling trainings on the calendar.

Revision ID: 161
Revises: 160
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "161"
down_revision = "160"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "program_year_trainings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "program_year_id",
            UUID(as_uuid=True),
            sa.ForeignKey("training_program_years.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "training_id",
            UUID(as_uuid=True),
            sa.ForeignKey("trainings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("program_year_id", "training_id", "start_date", name="uq_pyt_placement"),
    )
    op.create_index("idx_pyt_tenant", "program_year_trainings", ["tenant_id"])
    op.create_index("idx_pyt_program_year", "program_year_trainings", ["program_year_id"])

    # RLS
    op.execute("ALTER TABLE program_year_trainings ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY program_year_trainings_tenant_isolation ON program_year_trainings
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS program_year_trainings_tenant_isolation ON program_year_trainings")
    op.execute("ALTER TABLE program_year_trainings DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_pyt_program_year", table_name="program_year_trainings")
    op.drop_index("idx_pyt_tenant", table_name="program_year_trainings")
    op.drop_table("program_year_trainings")
