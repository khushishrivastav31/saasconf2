"""Add email_domain to tenants.

Revision ID: 103_tenant_email_domain
Revises: 102_user_pw_resets
Create Date: 2026-02-28
"""

import sqlalchemy as sa
from alembic import op

revision = "103_tenant_email_domain"
down_revision = "102_user_pw_resets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("email_domain", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "email_domain")
