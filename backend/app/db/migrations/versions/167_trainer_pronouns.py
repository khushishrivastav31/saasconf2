"""Add trainer_pronoun_options table and pronouns column on trainers.

Revision ID: 167
Revises: 166
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "167"
down_revision = "166"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add pronouns column to trainers
    op.add_column(
        "trainers",
        sa.Column("pronouns", sa.String(100), nullable=True),
    )

    # Create trainer_pronoun_options table
    op.create_table(
        "trainer_pronoun_options",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_trainer_pronoun_options_tenant", "trainer_pronoun_options", ["tenant_id"])
    op.create_index(
        "idx_trainer_pronoun_options_name",
        "trainer_pronoun_options",
        ["tenant_id", "name"],
        unique=True,
    )

    # RLS
    op.execute("ALTER TABLE trainer_pronoun_options ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY trainer_pronoun_options_tenant_isolation ON trainer_pronoun_options
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS trainer_pronoun_options_tenant_isolation ON trainer_pronoun_options")
    op.execute("ALTER TABLE trainer_pronoun_options DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_trainer_pronoun_options_name", table_name="trainer_pronoun_options")
    op.drop_index("idx_trainer_pronoun_options_tenant", table_name="trainer_pronoun_options")
    op.drop_table("trainer_pronoun_options")

    op.drop_column("trainers", "pronouns")
