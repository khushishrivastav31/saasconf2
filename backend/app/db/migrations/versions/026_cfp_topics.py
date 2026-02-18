"""Add cfp_topics table.

Revision ID: 026_cfp_topics
Revises: 025_cfp_require_picture_video
Create Date: 2026-01-28
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "026_cfp_topics"
down_revision = "025_cfp_require_picture_video"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cfp_topics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("idx_cfp_topics_tenant", "cfp_topics", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("idx_cfp_topics_tenant")
    op.drop_table("cfp_topics")
