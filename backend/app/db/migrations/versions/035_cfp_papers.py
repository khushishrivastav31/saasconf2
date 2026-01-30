"""Add CFP Papers tables.

Revision ID: 035_cfp_papers
Revises: 034_applicant_recording_consent
Create Date: 2026-01-28

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "035_cfp_papers"
down_revision: Union[str, None] = "034_applicant_recording_consent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. cfp_papers - main paper table
    op.create_table(
        "cfp_papers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cfp_id", UUID(as_uuid=True), sa.ForeignKey("call_for_papers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("main_speaker_id", UUID(as_uuid=True), sa.ForeignKey("cfp_applicants.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("session_type_id", UUID(as_uuid=True), sa.ForeignKey("session_types.id", ondelete="SET NULL"), nullable=True),
        # Content fields
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("abstract_short", sa.Text, nullable=True),
        sa.Column("abstract_long", sa.Text, nullable=True),
        sa.Column("level", sa.String(20), nullable=True),
        sa.Column("learning_objectives", sa.Text, nullable=True),
        sa.Column("importance", sa.Text, nullable=True),
        # Status
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        # Timestamps
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_cfp_papers_tenant", "cfp_papers", ["tenant_id"])
    op.create_index("idx_cfp_papers_cfp", "cfp_papers", ["cfp_id"])
    op.create_index("idx_cfp_papers_main_speaker", "cfp_papers", ["main_speaker_id"])
    op.create_index("idx_cfp_papers_status", "cfp_papers", ["tenant_id", "cfp_id", "status"])

    # 2. cfp_paper_cospeakers - M2M with applicants
    op.create_table(
        "cfp_paper_cospeakers",
        sa.Column("paper_id", UUID(as_uuid=True), sa.ForeignKey("cfp_papers.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("applicant_id", UUID(as_uuid=True), sa.ForeignKey("cfp_applicants.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
    )

    # 3. cfp_paper_topics - M2M with topics
    op.create_table(
        "cfp_paper_topics",
        sa.Column("paper_id", UUID(as_uuid=True), sa.ForeignKey("cfp_papers.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("topic_id", UUID(as_uuid=True), sa.ForeignKey("cfp_topics.id", ondelete="CASCADE"), primary_key=True),
    )

    # 4. cfp_paper_comments - committee feedback
    op.create_table(
        "cfp_paper_comments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("paper_id", UUID(as_uuid=True), sa.ForeignKey("cfp_papers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("committee_member_id", UUID(as_uuid=True), sa.ForeignKey("cfp_committee_members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_cfp_paper_comments_paper", "cfp_paper_comments", ["paper_id"])


def downgrade() -> None:
    op.drop_table("cfp_paper_comments")
    op.drop_table("cfp_paper_topics")
    op.drop_table("cfp_paper_cospeakers")
    op.drop_index("idx_cfp_papers_status", table_name="cfp_papers")
    op.drop_index("idx_cfp_papers_main_speaker", table_name="cfp_papers")
    op.drop_index("idx_cfp_papers_cfp", table_name="cfp_papers")
    op.drop_index("idx_cfp_papers_tenant", table_name="cfp_papers")
    op.drop_table("cfp_papers")
