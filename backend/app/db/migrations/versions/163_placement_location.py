"""Add location_id to program_year_trainings for venue assignment.

Revision ID: 163
Revises: 162
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "163"
down_revision = "162"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "program_year_trainings",
        sa.Column("location_id", UUID(as_uuid=True), sa.ForeignKey("locations.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("idx_pyt_location", "program_year_trainings", ["location_id"])


def downgrade() -> None:
    op.drop_index("idx_pyt_location", table_name="program_year_trainings")
    op.drop_column("program_year_trainings", "location_id")
