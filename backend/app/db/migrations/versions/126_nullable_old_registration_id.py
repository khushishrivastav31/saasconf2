"""Make old_registration_id nullable in registration_replacements.

Old registrations are now hard-deleted on replacement. The audit trail
is preserved via denormalized fields (old_attendee_email, old_attendee_name,
old_items_snapshot).

Revision ID: 126
Revises: 125
"""

import sqlalchemy as sa
from alembic import op

revision = "126"
down_revision = "125"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "registration_replacements",
        "old_registration_id",
        existing_type=sa.UUID(),
        nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "registration_replacements",
        "old_registration_id",
        existing_type=sa.UUID(),
        nullable=False,
    )
