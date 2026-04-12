"""Add exam_cost to syllabi.

Revision ID: 183
Revises: 182
"""

import sqlalchemy as sa
from alembic import op

revision = "183"
down_revision = "182"


def upgrade() -> None:
    op.add_column(
        "syllabi",
        sa.Column("exam_cost", sa.Numeric(10, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("syllabi", "exam_cost")
