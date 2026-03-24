"""Add language_id foreign key to training_themes.

Revision ID: 152
Revises: 151
Create Date: 2026-03-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "152"
down_revision = "151"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "training_themes",
        sa.Column(
            "language_id",
            UUID(as_uuid=True),
            sa.ForeignKey("training_languages.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_training_themes_language", "training_themes", ["language_id"])


def downgrade() -> None:
    op.drop_index("idx_training_themes_language")
    op.drop_column("training_themes", "language_id")
