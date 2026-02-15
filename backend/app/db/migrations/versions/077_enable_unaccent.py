"""Enable PostgreSQL unaccent extension for accent-insensitive search.

Revision ID: 077_enable_unaccent
Revises: 076_program_publication
Create Date: 2026-02-13
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "077_enable_unaccent"
down_revision: str | None = "076_program_publication"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS unaccent")
