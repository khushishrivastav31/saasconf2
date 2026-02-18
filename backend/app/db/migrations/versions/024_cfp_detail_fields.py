"""Add detail fields to call_for_papers table.

Revision ID: 024_cfp_detail_fields
Revises: 023_discount_codes
Create Date: 2026-01-28
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "024_cfp_detail_fields"
down_revision = "023_discount_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("call_for_papers", sa.Column("notification_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("call_for_papers", sa.Column("program_announcement_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("call_for_papers", sa.Column("code_of_conduct", sa.Text(), nullable=True))
    op.add_column("call_for_papers", sa.Column("incentives_conditions", sa.Text(), nullable=True))
    op.add_column("call_for_papers", sa.Column("tips_for_submission", sa.Text(), nullable=True))
    op.add_column("call_for_papers", sa.Column("guidelines_for_submissions", sa.Text(), nullable=True))
    op.add_column("call_for_papers", sa.Column("faqs", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("call_for_papers", "faqs")
    op.drop_column("call_for_papers", "guidelines_for_submissions")
    op.drop_column("call_for_papers", "tips_for_submission")
    op.drop_column("call_for_papers", "incentives_conditions")
    op.drop_column("call_for_papers", "code_of_conduct")
    op.drop_column("call_for_papers", "program_announcement_date")
    op.drop_column("call_for_papers", "notification_date")
