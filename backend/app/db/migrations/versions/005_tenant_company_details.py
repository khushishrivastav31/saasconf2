"""Add company details to tenants table.

Revision ID: 005_tenant_company_details
Revises: 004_tenant_module_enhancements
Create Date: 2026-01-23

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = "005_tenant_company_details"
down_revision = "004_tenant_module_enhancements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add address fields
    op.add_column('tenants', sa.Column('address', sa.String(500), nullable=True))
    op.add_column('tenants', sa.Column('postal_code', sa.String(20), nullable=True))
    op.add_column('tenants', sa.Column('city', sa.String(100), nullable=True))
    op.add_column('tenants', sa.Column('country', sa.String(100), nullable=True))

    # Add business fields
    op.add_column('tenants', sa.Column('vat_number', sa.String(50), nullable=True))
    op.add_column('tenants', sa.Column('website', sa.String(500), nullable=True))

    # Add contact persons as JSONB array
    # Structure: [{"name": "John Doe", "email": "john@example.com", "phone": "+1234567890", "role": "Manager"}, ...]
    op.add_column('tenants', sa.Column('contact_persons', JSONB, nullable=True, server_default='[]'))

    # Add comments field
    op.add_column('tenants', sa.Column('comments', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('tenants', 'comments')
    op.drop_column('tenants', 'contact_persons')
    op.drop_column('tenants', 'website')
    op.drop_column('tenants', 'vat_number')
    op.drop_column('tenants', 'country')
    op.drop_column('tenants', 'city')
    op.drop_column('tenants', 'postal_code')
    op.drop_column('tenants', 'address')
