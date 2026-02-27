"""Add theme_preference column to users and cfp_applicants.

Allows users to store their preferred theme ('light', 'dark', or NULL for system default).

Revision ID: 099_theme_preference
Revises: 098_sponsor_contracts
Create Date: 2026-02-27
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "099_theme_preference"
down_revision: Union[str, None] = "098_sponsor_contracts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("theme_preference", sa.String(5), nullable=True))
    op.add_column("cfp_applicants", sa.Column("theme_preference", sa.String(5), nullable=True))


def downgrade() -> None:
    op.drop_column("cfp_applicants", "theme_preference")
    op.drop_column("users", "theme_preference")
