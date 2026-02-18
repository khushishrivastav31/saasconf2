"""Add pronoun options table and user pronouns field.

Revision ID: 048_pronouns
Revises: 047_split_person_names
Create Date: 2026-01-30

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "048_pronouns"
down_revision: Union[str, None] = "047_split_person_names"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Create pronoun_options table (tenant-scoped, no conference_id)
    # ------------------------------------------------------------------
    op.create_table(
        "pronoun_options",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )
    op.create_index("idx_pronoun_options_tenant", "pronoun_options", ["tenant_id"])
    op.create_index("idx_pronoun_options_name", "pronoun_options", ["tenant_id", "name"], unique=True)

    # ------------------------------------------------------------------
    # 2. Add pronouns column to users table
    # ------------------------------------------------------------------
    op.add_column("users", sa.Column("pronouns", sa.String(100), nullable=True))

    # ------------------------------------------------------------------
    # 3. Seed default pronoun options for all existing tenants
    # ------------------------------------------------------------------
    op.execute("""
        INSERT INTO pronoun_options (id, tenant_id, name, is_active)
        SELECT gen_random_uuid(), t.id, pronoun_data.name, true
        FROM tenants t
        CROSS JOIN (VALUES
            ('he/him'),
            ('she/her'),
            ('they/them'),
            ('he/they'),
            ('she/they'),
            ('ze/hir'),
            ('xe/xem'),
            ('any pronouns'),
            ('prefer not to say')
        ) AS pronoun_data(name)
    """)


def downgrade() -> None:
    op.drop_column("users", "pronouns")
    op.drop_index("idx_pronoun_options_name", table_name="pronoun_options")
    op.drop_index("idx_pronoun_options_tenant", table_name="pronoun_options")
    op.drop_table("pronoun_options")
