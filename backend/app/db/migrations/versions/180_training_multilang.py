"""Add language columns to training registrations and attendees.

Revision ID: 180
Revises: 179
"""

import sqlalchemy as sa
from alembic import op

revision = "180"
down_revision = "179"


def upgrade() -> None:
    op.add_column(
        "training_registrations",
        sa.Column("language", sa.String(5), nullable=False, server_default="en"),
    )
    op.add_column(
        "training_registration_attendees",
        sa.Column("language", sa.String(5), nullable=False, server_default="en"),
    )


def downgrade() -> None:
    op.drop_column("training_registration_attendees", "language")
    op.drop_column("training_registrations", "language")
