"""Add visible_to_reviewer column to paper_form_fields and paper_form_variant_fields.

Revision ID: 226
Revises: 225
Create Date: 2026-06-24

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "226"
down_revision: Union[str, None] = "225"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "paper_form_fields",
        sa.Column("visible_to_reviewer", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "paper_form_variant_fields",
        sa.Column("visible_to_reviewer", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("paper_form_variant_fields", "visible_to_reviewer")
    op.drop_column("paper_form_fields", "visible_to_reviewer")
