"""Remove unique constraint to allow parallel training placements on same date.

Revision ID: 162
Revises: 161
Create Date: 2026-03-24
"""

from alembic import op

revision = "162"
down_revision = "161"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("uq_pyt_placement", "program_year_trainings", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint(
        "uq_pyt_placement",
        "program_year_trainings",
        ["program_year_id", "training_id", "start_date"],
    )
