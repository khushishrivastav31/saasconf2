"""Make pronoun_options conference-scoped instead of tenant-scoped.

Revision ID: 050_pronouns_conference_scoped
Revises: 049_applicant_pronouns
Create Date: 2026-01-30

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "050_pronouns_conference_scoped"
down_revision: Union[str, None] = "049_applicant_pronouns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Add conference_id column (nullable for now)
    # ------------------------------------------------------------------
    op.add_column(
        "pronoun_options",
        sa.Column("conference_id", UUID(as_uuid=True), nullable=True),
    )

    # ------------------------------------------------------------------
    # 2. Drop old unique index BEFORE duplicating rows (it would block
    #    inserts with the same tenant_id + name for different conferences)
    # ------------------------------------------------------------------
    op.drop_index("idx_pronoun_options_name", table_name="pronoun_options")

    # ------------------------------------------------------------------
    # 3. For each existing pronoun option, duplicate it per conference
    #    in that tenant, then delete the originals (which have NULL
    #    conference_id).
    # ------------------------------------------------------------------
    op.execute("""
        INSERT INTO pronoun_options (id, tenant_id, conference_id, name, is_active, created_at, updated_at)
        SELECT
            gen_random_uuid(),
            po.tenant_id,
            c.id,
            po.name,
            po.is_active,
            po.created_at,
            po.updated_at
        FROM pronoun_options po
        JOIN conferences c ON c.tenant_id = po.tenant_id
        WHERE po.conference_id IS NULL
    """)

    # Delete the old tenant-only rows
    op.execute("DELETE FROM pronoun_options WHERE conference_id IS NULL")

    # ------------------------------------------------------------------
    # 4. Make conference_id NOT NULL and add FK
    # ------------------------------------------------------------------
    op.alter_column("pronoun_options", "conference_id", nullable=False)
    op.create_foreign_key(
        "fk_pronoun_options_conference",
        "pronoun_options",
        "conferences",
        ["conference_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # ------------------------------------------------------------------
    # 5. Create new conference-scoped indexes
    # ------------------------------------------------------------------
    op.create_index(
        "idx_pronoun_options_conference",
        "pronoun_options",
        ["conference_id"],
    )
    op.create_index(
        "idx_pronoun_options_name",
        "pronoun_options",
        ["tenant_id", "conference_id", "name"],
        unique=True,
    )


def downgrade() -> None:
    # Drop new indexes
    op.drop_index("idx_pronoun_options_name", table_name="pronoun_options")
    op.drop_index("idx_pronoun_options_conference", table_name="pronoun_options")

    # Drop FK
    op.drop_constraint("fk_pronoun_options_conference", "pronoun_options", type_="foreignkey")

    # Recreate old unique index (tenant-only)
    # First deduplicate: keep only one row per (tenant_id, name)
    op.execute("""
        DELETE FROM pronoun_options
        WHERE id NOT IN (
            SELECT DISTINCT ON (tenant_id, name) id
            FROM pronoun_options
            ORDER BY tenant_id, name, created_at
        )
    """)

    # Set conference_id to NULL and drop column
    op.alter_column("pronoun_options", "conference_id", nullable=True)
    op.execute("UPDATE pronoun_options SET conference_id = NULL")
    op.drop_column("pronoun_options", "conference_id")

    # Recreate old unique index
    op.create_index(
        "idx_pronoun_options_name",
        "pronoun_options",
        ["tenant_id", "name"],
        unique=True,
    )
