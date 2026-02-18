"""Add require_picture and require_video to call_for_papers table.

Revision ID: 025_cfp_require_picture_video
Revises: 024_cfp_detail_fields
Create Date: 2026-01-28
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "025_cfp_require_picture_video"
down_revision = "024_cfp_detail_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("call_for_papers", sa.Column("require_picture", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("call_for_papers", sa.Column("require_video", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("call_for_papers", "require_video")
    op.drop_column("call_for_papers", "require_picture")
