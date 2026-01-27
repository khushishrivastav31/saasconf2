"""Add subscription dates, pricing, and limits to tenant_modules.

Revision ID: 004_tenant_module_enhancements
Revises: 003_call_for_papers
Create Date: 2026-01-23

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '004_tenant_module_enhancements'
down_revision: Union[str, None] = '003_call_for_papers'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add subscription date columns
    op.add_column(
        'tenant_modules',
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        'tenant_modules',
        sa.Column('end_date', sa.DateTime(timezone=True), nullable=True)
    )

    # Add pricing columns
    op.add_column(
        'tenant_modules',
        sa.Column('price', sa.Numeric(10, 2), nullable=True, server_default='0')
    )
    op.add_column(
        'tenant_modules',
        sa.Column('currency', sa.String(3), nullable=True, server_default='USD')
    )

    # Add resource limit columns
    op.add_column(
        'tenant_modules',
        sa.Column('max_papers', sa.Integer(), nullable=True)
    )
    op.add_column(
        'tenant_modules',
        sa.Column('max_speakers', sa.Integer(), nullable=True)
    )
    op.add_column(
        'tenant_modules',
        sa.Column('max_attendees', sa.Integer(), nullable=True)
    )
    op.add_column(
        'tenant_modules',
        sa.Column('max_volunteers', sa.Integer(), nullable=True)
    )

    # Add index for date-based queries
    op.create_index(
        'idx_tenant_modules_dates',
        'tenant_modules',
        ['start_date', 'end_date']
    )


def downgrade() -> None:
    # Drop index
    op.drop_index('idx_tenant_modules_dates', table_name='tenant_modules')

    # Drop columns in reverse order
    op.drop_column('tenant_modules', 'max_volunteers')
    op.drop_column('tenant_modules', 'max_attendees')
    op.drop_column('tenant_modules', 'max_speakers')
    op.drop_column('tenant_modules', 'max_papers')
    op.drop_column('tenant_modules', 'currency')
    op.drop_column('tenant_modules', 'price')
    op.drop_column('tenant_modules', 'end_date')
    op.drop_column('tenant_modules', 'start_date')
