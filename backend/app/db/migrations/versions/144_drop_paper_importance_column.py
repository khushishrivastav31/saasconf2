"""Drop importance column from cfp_papers table.

Revision ID: 144
Revises: 143
Create Date: 2026-03-17

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "144"
down_revision: Union[str, None] = "143"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("cfp_papers", "importance")


def downgrade() -> None:
    op.add_column(
        "cfp_papers",
        sa.Column("importance", sa.Text(), nullable=True),
    )
