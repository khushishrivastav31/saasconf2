"""Add attendance_type column to invoices table.

Stores attendance type for VAT calculation in hybrid conferences.

Revision ID: 117
Revises: 116
Create Date: 2026-03-06
"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "117"
down_revision: Union[str, None] = "116"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add attendance_type column to invoices table."""
    op.add_column(
        "invoices",
        sa.Column("attendance_type", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    """Remove attendance_type column from invoices table."""
    op.drop_column("invoices", "attendance_type")
