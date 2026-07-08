"""Add notification_sent_at column to cfp_papers.

Revision ID: 228
Revises: 227
Create Date: 2026-07-08

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "228"
down_revision: Union[str, None] = "227"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cfp_papers",
        sa.Column("notification_sent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("cfp_papers", "notification_sent_at")
