"""Convert training duration to integer and add color field.

Revision ID: 160
Revises: 159
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op

revision = "160"
down_revision = "159"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Convert duration from varchar to integer, extracting leading digits
    op.execute(
        """
        ALTER TABLE trainings
        ALTER COLUMN duration TYPE integer
        USING (
            CASE
                WHEN duration ~ '^\\d+'
                THEN (regexp_match(duration, '^(\\d+)'))[1]::integer
                ELSE NULL
            END
        )
        """
    )

    # Add color field for visual identification in calendar
    op.add_column("trainings", sa.Column("color", sa.String(7), nullable=True))


def downgrade() -> None:
    op.drop_column("trainings", "color")
    op.execute("ALTER TABLE trainings ALTER COLUMN duration TYPE varchar(100) USING duration::varchar")
