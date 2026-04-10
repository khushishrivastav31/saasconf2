"""Add exam fields to training_registration_attendees.

Revision ID: 182
Revises: 181
"""

import sqlalchemy as sa
from alembic import op

revision = "182"
down_revision = "181"


def upgrade() -> None:
    op.add_column(
        "training_registration_attendees",
        sa.Column("include_exam", sa.Boolean, nullable=False, server_default="false"),
    )
    op.add_column(
        "training_registration_attendees",
        sa.Column("exam_language", sa.String(100), nullable=True),
    )
    op.add_column(
        "training_registration_attendees",
        sa.Column("exam_mode", sa.String(20), nullable=True),
    )
    op.add_column(
        "training_registration_attendees",
        sa.Column("extra_time", sa.Boolean, nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("training_registration_attendees", "extra_time")
    op.drop_column("training_registration_attendees", "exam_mode")
    op.drop_column("training_registration_attendees", "exam_language")
    op.drop_column("training_registration_attendees", "include_exam")
