"""Add locale field to conferences table.

Stores BCP 47 locale tag (e.g. 'en', 'de', 'es') for locale-aware
date/number formatting.

Revision ID: 078_add_conference_locale
Revises: 077_enable_unaccent
Create Date: 2026-02-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "078_add_conference_locale"
down_revision: str | None = "077_enable_unaccent"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "conferences",
        sa.Column("locale", sa.String(10), nullable=True, server_default="en"),
    )


def downgrade() -> None:
    op.drop_column("conferences", "locale")
