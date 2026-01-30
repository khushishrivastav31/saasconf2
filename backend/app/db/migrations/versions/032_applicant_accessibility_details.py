"""Add accessibility_details to cfp_applicants.

Revision ID: 032_access_details
Revises: 031_applicant_social
Create Date: 2026-01-28
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "032_access_details"
down_revision = "031_applicant_social"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cfp_applicants",
        sa.Column("accessibility_details", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("cfp_applicants", "accessibility_details")
