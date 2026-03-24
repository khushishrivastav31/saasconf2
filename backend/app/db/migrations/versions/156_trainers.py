"""Add trainers table with M2M associations.

Revision ID: 156
Revises: 155
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "156"
down_revision = "155"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Trainers table
    op.create_table(
        "trainers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("vita", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_internal", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_trainers_tenant", "trainers", ["tenant_id"])
    op.create_index("idx_trainers_active", "trainers", ["tenant_id", "is_active"])

    # RLS
    op.execute("ALTER TABLE trainers ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY trainers_tenant_isolation ON trainers
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
        """
    )

    # M2M: trainer <-> trainings
    op.create_table(
        "trainer_trainings",
        sa.Column(
            "trainer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("trainers.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "training_id",
            UUID(as_uuid=True),
            sa.ForeignKey("trainings.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )

    # M2M: trainer <-> languages
    op.create_table(
        "trainer_languages",
        sa.Column(
            "trainer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("trainers.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "language_id",
            UUID(as_uuid=True),
            sa.ForeignKey("training_languages.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("trainer_languages")
    op.drop_table("trainer_trainings")
    op.execute("DROP POLICY IF EXISTS trainers_tenant_isolation ON trainers")
    op.execute("ALTER TABLE trainers DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_trainers_active", table_name="trainers")
    op.drop_index("idx_trainers_tenant", table_name="trainers")
    op.drop_table("trainers")
