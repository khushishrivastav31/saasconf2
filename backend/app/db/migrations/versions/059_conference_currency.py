"""Add currency field to conferences table.

Revision ID: 059_conference_currency
Revises: 058_discount_code_options
Create Date: 2025-02-11

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "059_conference_currency"
down_revision = "058_discount_code_options"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conferences",
        sa.Column("currency", sa.String(3), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conferences", "currency")
