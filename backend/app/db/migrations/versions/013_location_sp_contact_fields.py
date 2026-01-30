"""Add phone, website to locations and phone, email, website, address to service_providers.

Revision ID: 013_location_sp_contact_fields
Revises: 012_service_providers_conference
Create Date: 2026-01-27
"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "013_location_sp_contact_fields"
down_revision = "012_service_providers_conference"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Location: add phone and website
    op.add_column("locations", sa.Column("phone", sa.String(50), nullable=True))
    op.add_column("locations", sa.Column("website", sa.String(500), nullable=True))

    # ServiceProvider: add phone, email, website, address
    op.add_column("service_providers", sa.Column("phone", sa.String(50), nullable=True))
    op.add_column("service_providers", sa.Column("email", sa.String(255), nullable=True))
    op.add_column("service_providers", sa.Column("website", sa.String(500), nullable=True))
    op.add_column("service_providers", sa.Column("address", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("service_providers", "address")
    op.drop_column("service_providers", "website")
    op.drop_column("service_providers", "email")
    op.drop_column("service_providers", "phone")

    op.drop_column("locations", "website")
    op.drop_column("locations", "phone")
