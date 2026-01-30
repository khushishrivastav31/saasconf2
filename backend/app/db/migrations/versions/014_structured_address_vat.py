"""Replace SP single address with structured fields, add VAT to locations and service_providers.

Revision ID: 014_structured_address_vat
Revises: 013_location_sp_contact_fields
Create Date: 2026-01-27
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "014_structured_address_vat"
down_revision = "013_location_sp_contact_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Service Providers: replace single 'address' text with structured fields
    op.drop_column("service_providers", "address")
    op.add_column("service_providers", sa.Column("address_line1", sa.String(255), nullable=True))
    op.add_column("service_providers", sa.Column("address_line2", sa.String(255), nullable=True))
    op.add_column("service_providers", sa.Column("city", sa.String(100), nullable=True))
    op.add_column("service_providers", sa.Column("state", sa.String(100), nullable=True))
    op.add_column("service_providers", sa.Column("postal_code", sa.String(20), nullable=True))
    op.add_column("service_providers", sa.Column("country", sa.String(100), nullable=True))

    # VAT number for both tables
    op.add_column("service_providers", sa.Column("vat_number", sa.String(20), nullable=True))
    op.add_column("locations", sa.Column("vat_number", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("locations", "vat_number")
    op.drop_column("service_providers", "vat_number")

    op.drop_column("service_providers", "country")
    op.drop_column("service_providers", "postal_code")
    op.drop_column("service_providers", "state")
    op.drop_column("service_providers", "city")
    op.drop_column("service_providers", "address_line2")
    op.drop_column("service_providers", "address_line1")
    op.add_column("service_providers", sa.Column("address", sa.Text(), nullable=True))
