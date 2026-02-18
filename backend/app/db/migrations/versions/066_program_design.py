"""Add program design tables.

Tables for conference program design:
- program_days: Conference days
- program_time_slots: Time slots per day
- program_tracks: Parallel session columns/rooms
- program_sessions: Sessions placed in the grid

Revision ID: 066_program_design
Revises: 065_drop_conditional_visibility
Create Date: 2026-02-12

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision: str = "066_program_design"
down_revision: str | None = "065_drop_conditional_visibility"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create program design tables."""
    # program_days
    op.create_table(
        "program_days",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("name", sa.String(100), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("conference_id", "date", name="uq_program_days_conference_date"),
    )
    op.create_index(
        "idx_program_days_conference",
        "program_days",
        ["tenant_id", "conference_id"],
    )

    # program_time_slots
    op.create_table(
        "program_time_slots",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "program_day_id",
            UUID(as_uuid=True),
            sa.ForeignKey("program_days.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("program_day_id", "start_time", name="uq_program_slots_day_start"),
    )
    op.create_index(
        "idx_program_slots_day",
        "program_time_slots",
        ["program_day_id"],
    )

    # program_tracks
    op.create_table(
        "program_tracks",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column(
            "location_id",
            UUID(as_uuid=True),
            sa.ForeignKey("locations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_program_tracks_conference",
        "program_tracks",
        ["tenant_id", "conference_id"],
    )

    # program_sessions
    op.create_table(
        "program_sessions",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Grid placement
        sa.Column(
            "start_slot_id",
            UUID(as_uuid=True),
            sa.ForeignKey("program_time_slots.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "start_track_id",
            UUID(as_uuid=True),
            sa.ForeignKey("program_tracks.id", ondelete="SET NULL"),
            nullable=True,  # NULL = general event spanning all tracks
        ),
        # Span configuration
        sa.Column("slot_span", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("track_span", sa.Integer(), nullable=False, server_default="1"),
        # Session details
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "session_type_id",
            UUID(as_uuid=True),
            sa.ForeignKey("session_types.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # General events
        sa.Column("is_general_event", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("event_type", sa.String(50), nullable=True),
        # Visual
        sa.Column("color", sa.String(7), nullable=True),
        # Future: link to accepted paper
        sa.Column(
            "paper_id",
            UUID(as_uuid=True),
            sa.ForeignKey("cfp_papers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # Metadata
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("settings", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_program_sessions_conference",
        "program_sessions",
        ["conference_id"],
    )
    op.create_index(
        "idx_program_sessions_slot",
        "program_sessions",
        ["start_slot_id"],
    )


def downgrade() -> None:
    """Drop program design tables."""
    op.drop_table("program_sessions")
    op.drop_table("program_tracks")
    op.drop_table("program_time_slots")
    op.drop_table("program_days")
