"""Widen cfp_papers.level column from varchar(20) to varchar(50) for custom level options.

Revision ID: 142
Revises: 141
Create Date: 2026-03-17

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "142"
down_revision: Union[str, None] = "141"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "cfp_papers",
        "level",
        existing_type=sa.String(20),
        type_=sa.String(50),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "cfp_papers",
        "level",
        existing_type=sa.String(50),
        type_=sa.String(20),
        existing_nullable=True,
    )
