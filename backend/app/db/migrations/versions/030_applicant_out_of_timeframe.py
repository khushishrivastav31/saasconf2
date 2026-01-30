"""Add allow_out_of_timeframe to cfp_applicants.

Revision ID: 030_applicant_out_of_timeframe
Revises: 029_cfp_applicants
Create Date: 2026-01-28
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "030_applicant_out_of_timeframe"
down_revision = "029_cfp_applicants"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cfp_applicants",
        sa.Column("allow_out_of_timeframe", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("cfp_applicants", "allow_out_of_timeframe")
