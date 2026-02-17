"""Add separately_bookable column to session_types, program_sessions, cfp_papers.

Revision ID: 086_separately_bookable
Revises: 085_registration_booking_option
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "086_separately_bookable"
down_revision: str = "085_registration_booking_option"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "session_types",
        sa.Column("separately_bookable", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "program_sessions",
        sa.Column("separately_bookable", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "cfp_papers",
        sa.Column("separately_bookable", sa.Boolean(), server_default="false", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("cfp_papers", "separately_bookable")
    op.drop_column("program_sessions", "separately_bookable")
    op.drop_column("session_types", "separately_bookable")
