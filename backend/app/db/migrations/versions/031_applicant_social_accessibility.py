"""Add social_links and needs_accessibility to cfp_applicants.

Revision ID: 031_applicant_social_accessibility
Revises: 030_applicant_out_of_timeframe
Create Date: 2026-01-28
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "031_applicant_social"
down_revision = "030_applicant_out_of_timeframe"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cfp_applicants",
        sa.Column("social_links", JSONB, nullable=True, server_default="{}"),
    )
    op.add_column(
        "cfp_applicants",
        sa.Column("needs_accessibility", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("cfp_applicants", "needs_accessibility")
    op.drop_column("cfp_applicants", "social_links")
