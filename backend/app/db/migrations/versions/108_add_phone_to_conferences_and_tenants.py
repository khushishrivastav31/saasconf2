"""Add phone column to conferences and tenants tables.

Provides a top-level phone number for conferences (used in invoice
[PHONE]/[TELEFON] placeholders) and for tenants (My Company page).

Revision ID: 108
Revises: 107
Create Date: 2026-03-04
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers
revision = "108"
down_revision = "107"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conferences",
        sa.Column("phone", sa.String(50), nullable=True),
    )
    op.add_column(
        "tenants",
        sa.Column("phone", sa.String(50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tenants", "phone")
    op.drop_column("conferences", "phone")
