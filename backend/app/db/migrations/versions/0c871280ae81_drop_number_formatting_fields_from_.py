"""Drop number formatting fields from conferences table.

Number formatting is now automatic based on currency code.

Revision ID: 0c871280ae81
Revises: 062_drop_tenant_number_format
Create Date: 2026-02-11

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0c871280ae81"
down_revision: str | None = "062_drop_tenant_number_format"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Drop number formatting columns from conferences."""
    op.drop_column("conferences", "decimal_separator")
    op.drop_column("conferences", "thousands_separator")
    op.drop_column("conferences", "currency_position")
    op.drop_column("conferences", "decimal_places")


def downgrade() -> None:
    """Restore number formatting columns to conferences."""
    op.add_column(
        "conferences",
        sa.Column("decimal_places", sa.Integer(), nullable=True),
    )
    op.add_column(
        "conferences",
        sa.Column("currency_position", sa.String(10), nullable=True),
    )
    op.add_column(
        "conferences",
        sa.Column("thousands_separator", sa.String(1), nullable=True),
    )
    op.add_column(
        "conferences",
        sa.Column("decimal_separator", sa.String(1), nullable=True),
    )
