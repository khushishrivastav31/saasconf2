"""Create syllabi table.

Revision ID: 154
Revises: 153
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "154"
down_revision = "153"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "syllabi",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("price", sa.Numeric(10, 2), nullable=True),
        sa.Column(
            "certification_body_id",
            UUID(as_uuid=True),
            sa.ForeignKey("certification_bodies.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "language_id",
            UUID(as_uuid=True),
            sa.ForeignKey("training_languages.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_syllabi_tenant", "syllabi", ["tenant_id"])
    op.create_index("idx_syllabi_slug_tenant", "syllabi", ["slug", "tenant_id"], unique=True)

    # RLS policy
    op.execute("ALTER TABLE syllabi ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY syllabi_tenant_isolation ON syllabi
        USING (
            current_setting('app.is_super_admin', true) = 'true'
            OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS syllabi_tenant_isolation ON syllabi")
    op.execute("ALTER TABLE syllabi DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_syllabi_slug_tenant")
    op.drop_index("idx_syllabi_tenant")
    op.drop_table("syllabi")
