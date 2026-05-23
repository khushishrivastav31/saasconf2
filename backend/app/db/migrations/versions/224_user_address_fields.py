"""Add address fields to users table.

Revision ID: 224
Revises: 223
Create Date: 2026-05-20

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "224"
down_revision: Union[str, None] = "223"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("address_line_1", sa.String(500), nullable=True))
    op.add_column("users", sa.Column("address_line_2", sa.String(500), nullable=True))
    op.add_column("users", sa.Column("city", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("postal_code", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("country", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "country")
    op.drop_column("users", "postal_code")
    op.drop_column("users", "city")
    op.drop_column("users", "address_line_2")
    op.drop_column("users", "address_line_1")
