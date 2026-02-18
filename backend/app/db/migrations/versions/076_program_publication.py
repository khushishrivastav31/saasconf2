"""Add program_published_at to conferences.

Tracks when the conference program was last published/updated.

Revision ID: 076_program_publication
Revises: 075_messaging_notes_flags
Create Date: 2026-02-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "076_program_publication"
down_revision: str | None = "075_messaging_notes_flags"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "conferences",
        sa.Column("program_published_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conferences", "program_published_at")
