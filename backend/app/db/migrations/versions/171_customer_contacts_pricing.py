"""Add contact_persons, price, currency, website, comments, state to customers.

Revision ID: 171
Revises: 170
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "171"
down_revision = "170"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("customers", sa.Column("contact_persons", JSONB, server_default="[]", nullable=False))
    op.add_column("customers", sa.Column("price", sa.Numeric(12, 2), nullable=True))
    op.add_column("customers", sa.Column("currency", sa.String(3), nullable=True))
    op.add_column("customers", sa.Column("website", sa.String(255), nullable=True))
    op.add_column("customers", sa.Column("comments", sa.Text(), nullable=True))
    op.add_column("customers", sa.Column("state", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("customers", "state")
    op.drop_column("customers", "comments")
    op.drop_column("customers", "website")
    op.drop_column("customers", "currency")
    op.drop_column("customers", "price")
    op.drop_column("customers", "contact_persons")
