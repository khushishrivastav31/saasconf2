"""Add support_email and contact_email to conferences.

Revision ID: 054_conference_emails
Revises: 053_email_templates
Create Date: 2026-02-10
"""

import sqlalchemy as sa
from alembic import op

revision = "054_conference_emails"
down_revision = "053_email_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conferences",
        sa.Column("support_email", sa.String(255), nullable=True),
    )
    op.add_column(
        "conferences",
        sa.Column("contact_email", sa.String(255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conferences", "contact_email")
    op.drop_column("conferences", "support_email")
