"""Fix replacement_reason field length (50 -> 1000)

Revision ID: 124
Revises: 123
Create Date: 2026-03-08 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '124'
down_revision = '123'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Alter replacement_reason column to allow 1000 characters instead of 50
    # to match the API schema validation (max_length=1000)
    op.alter_column(
        'invoices',
        'replacement_reason',
        type_=sa.String(length=1000),
        existing_type=sa.String(length=50),
        existing_nullable=True
    )


def downgrade() -> None:
    # Revert to 50 characters (may truncate data!)
    op.alter_column(
        'invoices',
        'replacement_reason',
        type_=sa.String(length=50),
        existing_type=sa.String(length=1000),
        existing_nullable=True
    )
