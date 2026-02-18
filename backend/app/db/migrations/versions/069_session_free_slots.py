"""Add session-free time slots and allow override on sessions.

Time slots can be marked as session-free (breaks, lunch, etc.).
Normal sessions cannot be placed in session-free slots unless
they have the allow_in_session_free flag set.

Revision ID: 069_session_free_slots
Revises: 068_drop_event_types
Create Date: 2026-02-13
"""

import sqlalchemy as sa
from alembic import op

revision = "069_session_free_slots"
down_revision = "068_drop_event_types"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add is_session_free to program_time_slots
    op.add_column(
        "program_time_slots",
        sa.Column("is_session_free", sa.Boolean, nullable=False, server_default="false"),
    )

    # Add allow_in_session_free to program_sessions
    op.add_column(
        "program_sessions",
        sa.Column("allow_in_session_free", sa.Boolean, nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("program_sessions", "allow_in_session_free")
    op.drop_column("program_time_slots", "is_session_free")
