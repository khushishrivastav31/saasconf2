"""Create training_themes table.

Revision ID: 150
Revises: 149
Create Date: 2026-03-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "150"
down_revision = "149"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "training_themes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_training_themes_tenant", "training_themes", ["tenant_id"])

    # RLS policy
    op.execute("ALTER TABLE training_themes ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY training_themes_tenant_isolation ON training_themes
        USING (
            current_setting('app.is_super_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS training_themes_tenant_isolation ON training_themes")
    op.execute("ALTER TABLE training_themes DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_training_themes_tenant")
    op.drop_table("training_themes")
