"""Add placement_type to program_year_trainings.

Revision ID: 173
Revises: 172
"""

import sqlalchemy as sa
from alembic import op

revision = "173"
down_revision = "172"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "program_year_trainings",
        sa.Column("placement_type", sa.String(20), server_default="open", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("program_year_trainings", "placement_type")
