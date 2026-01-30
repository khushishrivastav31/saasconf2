"""Replace is_virtual boolean with venue_type string column.

Revision ID: 041_conference_venue_type
Revises: 040_committee_role_settings
Create Date: 2026-01-29

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "041_conference_venue_type"
down_revision: Union[str, None] = "040_committee_role_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add venue_type column with default "onsite"
    op.add_column(
        "conferences",
        sa.Column("venue_type", sa.String(20), nullable=False, server_default="onsite"),
    )

    # 2. Migrate existing data: is_virtual=true -> "hybrid" (best guess for existing virtual-flagged conferences)
    op.execute("UPDATE conferences SET venue_type = 'hybrid' WHERE is_virtual = true")

    # 3. Drop the is_virtual column
    op.drop_column("conferences", "is_virtual")


def downgrade() -> None:
    # 1. Re-add is_virtual column
    op.add_column(
        "conferences",
        sa.Column("is_virtual", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # 2. Migrate data back: virtual/hybrid -> is_virtual=true
    op.execute("UPDATE conferences SET is_virtual = true WHERE venue_type IN ('virtual', 'hybrid')")

    # 3. Drop venue_type column
    op.drop_column("conferences", "venue_type")
