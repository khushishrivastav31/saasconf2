"""Add display_name column to email_templates.

Revision ID: 135
Revises: 134
Create Date: 2026-03-15
"""

import sqlalchemy as sa
from alembic import op

revision = "135"
down_revision = "134"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "email_templates",
        sa.Column("display_name", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("email_templates", "display_name")
