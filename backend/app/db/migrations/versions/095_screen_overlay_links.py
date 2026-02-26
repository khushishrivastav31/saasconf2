"""Add screen_overlay_id FK to news_articles, message_threads, email_templates, message_templates.

Revision ID: 095_screen_overlay_links
Revises: 094_screen_overlays
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "095_screen_overlay_links"
down_revision: str = "094_screen_overlays"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = ["news_articles", "message_threads", "email_templates", "message_templates"]


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(
            table,
            sa.Column(
                "screen_overlay_id",
                sa.UUID(),
                sa.ForeignKey("screen_overlays.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index(f"ix_{table}_screen_overlay_id", table, ["screen_overlay_id"])


def downgrade() -> None:
    for table in reversed(_TABLES):
        op.drop_index(f"ix_{table}_screen_overlay_id", table_name=table)
        op.drop_column(table, "screen_overlay_id")
