"""Add logo_url to tenants.

Revision ID: 055_tenant_logo
Revises: 054_conference_emails
Create Date: 2026-02-10
"""

import sqlalchemy as sa
from alembic import op

revision = "055_tenant_logo"
down_revision = "054_conference_emails"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("logo_url", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenants", "logo_url")
