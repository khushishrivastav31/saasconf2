"""Add venue_url to conferences.

Revision ID: 093_conference_venue_url
Revises: 092_conference_address_fields
Create Date: 2026-02-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "093_conference_venue_url"
down_revision: str = "092_conference_address_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("conferences", sa.Column("venue_url", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("conferences", "venue_url")
