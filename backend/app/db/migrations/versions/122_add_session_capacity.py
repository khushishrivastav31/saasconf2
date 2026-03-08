"""Add max_attendees to session_types.

Revision ID: 122
Revises: 121
Create Date: 2026-03-07

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "122"
down_revision = "121"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add max_attendees column to session_types table
    # NULL means unlimited capacity
    op.add_column(
        "session_types",
        sa.Column("max_attendees", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("session_types", "max_attendees")
