"""Add dynamic_recipient_lists table for filter-based recipient lists.

Revision ID: 141
Revises: 140
Create Date: 2026-03-16

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "141"
down_revision: Union[str, None] = "140"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dynamic_recipient_lists",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("target_type", sa.String(20), nullable=False),
        sa.Column(
            "filters",
            sa.dialects.postgresql.JSONB,
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "tenant_id",
            "conference_id",
            "name",
            name="uq_dynamic_recipient_lists_name",
        ),
    )
    op.create_index(
        "idx_dynamic_recipient_lists_tenant",
        "dynamic_recipient_lists",
        ["tenant_id"],
    )
    op.create_index(
        "idx_dynamic_recipient_lists_conference",
        "dynamic_recipient_lists",
        ["conference_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_dynamic_recipient_lists_conference")
    op.drop_index("idx_dynamic_recipient_lists_tenant")
    op.drop_table("dynamic_recipient_lists")
