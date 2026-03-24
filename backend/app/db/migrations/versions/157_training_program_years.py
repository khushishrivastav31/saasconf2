"""Add training program years table.

Revision ID: 157
Revises: 156
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "157"
down_revision = "156"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "training_program_years",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "year", name="uq_program_year_tenant"),
    )
    op.create_index("idx_tpy_tenant", "training_program_years", ["tenant_id"])

    # RLS
    op.execute("ALTER TABLE training_program_years ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY training_program_years_tenant_isolation ON training_program_years
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS training_program_years_tenant_isolation ON training_program_years")
    op.execute("ALTER TABLE training_program_years DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_tpy_tenant", table_name="training_program_years")
    op.drop_table("training_program_years")
