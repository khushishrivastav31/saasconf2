"""Add screen_overlays table.

Revision ID: 094_screen_overlays
Revises: 093_conference_venue_url
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "094_screen_overlays"
down_revision: str = "093_conference_venue_url"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "screen_overlays",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.UUID(),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            sa.UUID(),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("trigger_type", sa.String(30), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("body_text", sa.Text(), nullable=True),
        sa.Column("animation_style", sa.String(30), nullable=False, server_default="fade"),
        sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("schedule_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
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
    )
    op.create_index("ix_screen_overlays_tenant_id", "screen_overlays", ["tenant_id"])
    op.create_index(
        "ix_screen_overlays_tenant_conference",
        "screen_overlays",
        ["tenant_id", "conference_id"],
    )
    op.create_index(
        "ix_screen_overlays_active",
        "screen_overlays",
        ["conference_id", "is_active", "trigger_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_screen_overlays_active", table_name="screen_overlays")
    op.drop_index("ix_screen_overlays_tenant_conference", table_name="screen_overlays")
    op.drop_index("ix_screen_overlays_tenant_id", table_name="screen_overlays")
    op.drop_table("screen_overlays")
