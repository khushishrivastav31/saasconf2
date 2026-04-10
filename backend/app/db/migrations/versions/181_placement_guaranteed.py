"""Add is_guaranteed flag to program_year_trainings.

Revision ID: 181
Revises: 180
"""

import sqlalchemy as sa
from alembic import op

revision = "181"
down_revision = "180"


def upgrade() -> None:
    op.add_column(
        "program_year_trainings",
        sa.Column("is_guaranteed", sa.Boolean, nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("program_year_trainings", "is_guaranteed")
