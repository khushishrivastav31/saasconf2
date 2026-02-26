"""Add image_url column to screen_overlays.

Revision ID: 096_screen_overlay_image_url
Revises: 095_screen_overlay_links
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "096_screen_overlay_image_url"
down_revision: str = "095_screen_overlay_links"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "screen_overlays",
        sa.Column("image_url", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("screen_overlays", "image_url")
