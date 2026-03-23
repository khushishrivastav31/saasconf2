"""Add per-tenant Resend email settings columns.

Revision ID: 147
Revises: 146
"""

import os
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "147"
down_revision: str = "146"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("resend_api_key", sa.String(255), nullable=True))
    op.add_column("tenants", sa.Column("resend_from_email", sa.String(255), nullable=True))
    op.add_column("tenants", sa.Column("resend_from_name", sa.String(255), nullable=True))

    # Pre-populate existing tenants with current env var defaults
    tenants = sa.table(
        "tenants",
        sa.column("resend_api_key", sa.String),
        sa.column("resend_from_email", sa.String),
        sa.column("resend_from_name", sa.String),
    )
    api_key = os.environ.get("RESEND_API_KEY", "")
    from_email = os.environ.get("RESEND_FROM_EMAIL", "noreply@sonrisa.ventures")
    from_name = os.environ.get("RESEND_FROM_NAME", "SaaSConf")
    op.execute(
        tenants.update().values(
            resend_api_key=api_key if api_key else None,
            resend_from_email=from_email,
            resend_from_name=from_name,
        )
    )


def downgrade() -> None:
    op.drop_column("tenants", "resend_from_name")
    op.drop_column("tenants", "resend_from_email")
    op.drop_column("tenants", "resend_api_key")
