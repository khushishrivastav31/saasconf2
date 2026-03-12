"""Add index on registrations(conference_id, created_at) for period attribution queries.

Revision ID: 132
Revises: 131
"""

from alembic import op

revision = "132"
down_revision = "131"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "idx_registrations_conference_created_at",
        "registrations",
        ["conference_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_registrations_conference_created_at", table_name="registrations")
