"""Add is_active flag to program_year_trainings.

Allows deactivating a placement so it no longer appears in the public
registration portal or in offer-management placement pickers. Existing rows
default to active.

Revision ID: 198
Revises: 197
"""

import sqlalchemy as sa
from alembic import op

revision = "198"
down_revision = "197"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "program_year_trainings",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("program_year_trainings", "is_active")
