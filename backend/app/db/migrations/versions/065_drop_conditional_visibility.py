"""Drop conditional_visibility column from paper_form_fields.

This feature was removed to simplify the form builder.

Revision ID: 065_drop_conditional_visibility
Revises: 064_add_paper_form_schema
Create Date: 2026-02-11

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = "065_drop_conditional_visibility"
down_revision: str | None = "064_add_paper_form_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Drop conditional_visibility column from paper_form_fields."""
    op.drop_column("paper_form_fields", "conditional_visibility")


def downgrade() -> None:
    """Add conditional_visibility column back to paper_form_fields."""
    op.add_column(
        "paper_form_fields",
        sa.Column("conditional_visibility", JSONB(), nullable=True),
    )
