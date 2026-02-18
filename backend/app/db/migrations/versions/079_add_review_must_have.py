"""Add must_have flag to paper_reviews and review_form_settings.

Allows committee members to flag a paper as a must-have for the program.
Conference organizers can toggle the feature per conference.

Revision ID: 079_add_review_must_have
Revises: 078_add_conference_locale
Create Date: 2026-02-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "079_add_review_must_have"
down_revision: str | None = "078_add_conference_locale"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "paper_reviews",
        sa.Column("must_have", sa.Boolean, nullable=False, server_default="false"),
    )
    op.add_column(
        "review_form_settings",
        sa.Column("enable_must_have", sa.Boolean, nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("review_form_settings", "enable_must_have")
    op.drop_column("paper_reviews", "must_have")
