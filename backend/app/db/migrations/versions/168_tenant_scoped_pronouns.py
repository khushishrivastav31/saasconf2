"""Make pronoun_options tenant-scoped: deduplicate, drop conference_id, drop trainer_pronoun_options.

Revision ID: 168
Revises: 167
Create Date: 2026-03-25
"""

import sqlalchemy as sa
from alembic import op

revision = "168"
down_revision = "167"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Deduplicate pronoun_options — keep one row per (tenant_id, name)
    # Prefer is_active=true, then most recent created_at
    op.execute("""
        DELETE FROM pronoun_options
        WHERE id NOT IN (
            SELECT DISTINCT ON (tenant_id, name) id
            FROM pronoun_options
            ORDER BY tenant_id, name, is_active DESC, created_at DESC
        )
    """)

    # Step 2: Copy trainer_pronoun_options rows not already in pronoun_options
    op.execute("""
        INSERT INTO pronoun_options (id, tenant_id, name, is_active, created_at, updated_at)
        SELECT id, tenant_id, name, is_active, created_at, updated_at
        FROM trainer_pronoun_options tpo
        WHERE NOT EXISTS (
            SELECT 1 FROM pronoun_options po
            WHERE po.tenant_id = tpo.tenant_id AND po.name = tpo.name
        )
    """)

    # Step 3: Drop old unique index (tenant_id, conference_id, name)
    op.drop_index("idx_pronoun_options_name", table_name="pronoun_options")

    # Step 4: Drop conference index
    op.drop_index("idx_pronoun_options_conference", table_name="pronoun_options")

    # Step 5: Drop conference_id column
    op.drop_column("pronoun_options", "conference_id")

    # Step 6: Create new unique index on (tenant_id, name)
    op.create_index(
        "idx_pronoun_options_name",
        "pronoun_options",
        ["tenant_id", "name"],
        unique=True,
    )

    # Step 7: Drop trainer_pronoun_options table
    op.execute("DROP POLICY IF EXISTS trainer_pronoun_options_tenant_isolation ON trainer_pronoun_options")
    op.execute("ALTER TABLE trainer_pronoun_options DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_trainer_pronoun_options_name", table_name="trainer_pronoun_options")
    op.drop_index("idx_trainer_pronoun_options_tenant", table_name="trainer_pronoun_options")
    op.drop_table("trainer_pronoun_options")


def downgrade() -> None:
    # Re-create trainer_pronoun_options table
    op.create_table(
        "trainer_pronoun_options",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            sa.UUID(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
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
    op.execute("ALTER TABLE trainer_pronoun_options ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY trainer_pronoun_options_tenant_isolation ON trainer_pronoun_options
        USING (
            tenant_id::text = current_setting('app.current_tenant_id', true)
            OR current_setting('app.is_super_admin', true)::boolean = true
        )
    """)

    # Re-add conference_id column
    op.drop_index("idx_pronoun_options_name", table_name="pronoun_options")
    op.add_column(
        "pronoun_options",
        sa.Column("conference_id", sa.UUID(), nullable=True),
    )
    op.create_index("idx_pronoun_options_conference", "pronoun_options", ["conference_id"])
    op.create_index(
        "idx_pronoun_options_name",
        "pronoun_options",
        ["tenant_id", "conference_id", "name"],
        unique=True,
    )
