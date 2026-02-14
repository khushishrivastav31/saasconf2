"""Make program tracks per-day instead of per-conference.

Each day can now have its own set of tracks (columns in the grid).
Adds program_day_id FK to program_tracks table.

Revision ID: 070_tracks_per_day
Revises: 069_session_free_slots
Create Date: 2026-02-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "070_tracks_per_day"
down_revision = "069_session_free_slots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add program_day_id column (nullable initially for existing data)
    op.add_column(
        "program_tracks",
        sa.Column(
            "program_day_id",
            UUID(as_uuid=True),
            sa.ForeignKey("program_days.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )

    # Add index for efficient day-scoped queries
    op.create_index(
        "idx_program_tracks_day",
        "program_tracks",
        ["program_day_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_program_tracks_day", table_name="program_tracks")
    op.drop_column("program_tracks", "program_day_id")
