"""Add attendance_type column to booking_options table.

Used for automatic VAT calculation: in_person, virtual, hybrid_onsite, hybrid_online

Revision ID: 113
Revises: 112
Create Date: 2026-03-06
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "113"
down_revision: Union[str, None] = "112"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add attendance_type column to booking_options table."""
    op.add_column(
        "booking_options",
        sa.Column("attendance_type", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    """Remove attendance_type column from booking_options table."""
    op.drop_column("booking_options", "attendance_type")
