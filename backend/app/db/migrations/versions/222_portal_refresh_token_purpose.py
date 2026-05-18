"""Add ``purpose`` column to portal_refresh_tokens.

Distinguishes token intent without requiring a separate table:
  'setup'  — first-time password setup sent in welcome email (7-day expiry)
  'reset'  — forgot-password flow (1-hour expiry)
  NULL     — legacy session refresh tokens (backwards compat; no data migration needed)

The new setup-password endpoint filters on purpose='setup' so a reset token
cannot be used to set up a new account and vice-versa.

Revision ID: 222
Revises: 221
"""

import sqlalchemy as sa
from alembic import op

revision = "222"
down_revision = "221"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "portal_refresh_tokens",
        sa.Column("purpose", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("portal_refresh_tokens", "purpose")
