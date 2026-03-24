"""Add trainer unavailability table.

Revision ID: 159
Revises: 158
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "159"
down_revision = "158"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trainer_unavailability",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trainer_id", UUID(as_uuid=True), sa.ForeignKey("trainers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("end_date >= start_date", name="ck_trainer_unavail_dates"),
    )
    op.create_index("idx_trainer_unavail_trainer", "trainer_unavailability", ["tenant_id", "trainer_id"])
    op.create_index("idx_trainer_unavail_dates", "trainer_unavailability", ["trainer_id", "start_date", "end_date"])

    op.execute("ALTER TABLE trainer_unavailability ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY trainer_unavailability_tenant_isolation ON trainer_unavailability
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS trainer_unavailability_tenant_isolation ON trainer_unavailability")
    op.execute("ALTER TABLE trainer_unavailability DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_trainer_unavail_dates", table_name="trainer_unavailability")
    op.drop_index("idx_trainer_unavail_trainer", table_name="trainer_unavailability")
    op.drop_table("trainer_unavailability")
