"""Add last_edited_at and edit_count columns to paper_reviews.

Revision ID: 227
Revises: 226
Create Date: 2026-07-03

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "227"
down_revision: Union[str, None] = "226"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "paper_reviews",
        sa.Column("last_edited_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "paper_reviews",
        sa.Column("edit_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("paper_reviews", "edit_count")
    op.drop_column("paper_reviews", "last_edited_at")
