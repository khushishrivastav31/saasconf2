"""Add cfp_committee_member_topics junction table.

Revision ID: 028_committee_member_topics
Revises: 027_cfp_committee_members
Create Date: 2026-01-28
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "028_committee_member_topics"
down_revision = "027_cfp_committee_members"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cfp_committee_member_topics",
        sa.Column(
            "committee_member_id",
            UUID(as_uuid=True),
            sa.ForeignKey("cfp_committee_members.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("topic_id", UUID(as_uuid=True), sa.ForeignKey("cfp_topics.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("idx_cfp_cmt_topic_id", "cfp_committee_member_topics", ["topic_id"])


def downgrade() -> None:
    op.drop_index("idx_cfp_cmt_topic_id")
    op.drop_table("cfp_committee_member_topics")
