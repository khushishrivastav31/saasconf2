"""Add invitation status to cfp_paper_cospeakers.

Revision ID: 036_cospeaker_invitations
Revises: 035_cfp_papers
Create Date: 2026-01-28

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "036_cospeaker_invitations"
down_revision: Union[str, None] = "035_cfp_papers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "cfp_paper_cospeakers",
        sa.Column("invitation_status", sa.String(20), nullable=False, server_default="pending"),
    )
    op.add_column(
        "cfp_paper_cospeakers",
        sa.Column("invited_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.add_column(
        "cfp_paper_cospeakers",
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("cfp_paper_cospeakers", "responded_at")
    op.drop_column("cfp_paper_cospeakers", "invited_at")
    op.drop_column("cfp_paper_cospeakers", "invitation_status")
