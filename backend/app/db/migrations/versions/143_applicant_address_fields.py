"""Add address fields to cfp_applicants table.

Revision ID: 143
Revises: 142
Create Date: 2026-03-17

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "143"
down_revision: Union[str, None] = "142"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("cfp_applicants", sa.Column("address_line_1", sa.String(500), nullable=True))
    op.add_column("cfp_applicants", sa.Column("address_line_2", sa.String(500), nullable=True))
    op.add_column("cfp_applicants", sa.Column("city", sa.String(255), nullable=True))
    op.add_column("cfp_applicants", sa.Column("postal_code", sa.String(20), nullable=True))
    op.add_column("cfp_applicants", sa.Column("country", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("cfp_applicants", "country")
    op.drop_column("cfp_applicants", "postal_code")
    op.drop_column("cfp_applicants", "city")
    op.drop_column("cfp_applicants", "address_line_2")
    op.drop_column("cfp_applicants", "address_line_1")
