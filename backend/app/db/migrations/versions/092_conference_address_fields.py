"""Add state and postal_code to conferences for international address support.

Revision ID: 092_conference_address_fields
Revises: 091_data_retention
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "092_conference_address_fields"
down_revision: str = "091_data_retention"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("conferences", sa.Column("state", sa.String(100), nullable=True))
    op.add_column("conferences", sa.Column("postal_code", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("conferences", "postal_code")
    op.drop_column("conferences", "state")
