"""Add is_anonymous_review and reviewers_per_paper to call_for_papers.

Revision ID: 043_cfp_review_settings
Revises: 042_paper_assignments
Create Date: 2026-01-29

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "043_cfp_review_settings"
down_revision: Union[str, None] = "042_paper_assignments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "call_for_papers",
        sa.Column(
            "is_anonymous_review",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "call_for_papers",
        sa.Column(
            "reviewers_per_paper",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("3"),
        ),
    )


def downgrade() -> None:
    op.drop_column("call_for_papers", "reviewers_per_paper")
    op.drop_column("call_for_papers", "is_anonymous_review")
