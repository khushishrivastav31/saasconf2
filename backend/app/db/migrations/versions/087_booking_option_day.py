"""Add conference_day_id to booking_options.

Revision ID: 087_booking_option_day
Revises: 086_separately_bookable
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "087_booking_option_day"
down_revision: str = "086_separately_bookable"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "booking_options",
        sa.Column(
            "conference_day_id",
            sa.UUID(as_uuid=True),
            sa.ForeignKey("program_days.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_booking_options_day", "booking_options", ["conference_day_id"])


def downgrade() -> None:
    op.drop_index("idx_booking_options_day", table_name="booking_options")
    op.drop_column("booking_options", "conference_day_id")
