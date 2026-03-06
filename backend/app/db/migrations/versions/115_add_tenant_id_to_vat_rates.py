"""Add tenant_id to vat_rates_by_country table

Revision ID: 115
Revises: 114
Create Date: 2026-03-06
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "115"
down_revision = "114"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add tenant_id column (nullable first for existing data)
    op.add_column(
        "vat_rates_by_country",
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=True),
    )

    # Add foreign key constraint
    op.create_foreign_key(
        "fk_vat_rates_by_country_tenant_id",
        "vat_rates_by_country",
        "tenants",
        ["tenant_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Add index for tenant_id (performance)
    op.create_index(
        "ix_vat_rates_by_country_tenant_id",
        "vat_rates_by_country",
        ["tenant_id"],
    )

    # Drop old unique constraint on country_code (only applies to NULL tenant_id rows now)
    op.drop_constraint("vat_rates_by_country_country_code_key", "vat_rates_by_country", type_="unique")

    # Add new unique constraint on (tenant_id, country_code)
    op.create_unique_constraint(
        "uq_vat_rates_tenant_country",
        "vat_rates_by_country",
        ["tenant_id", "country_code"],
    )

    # Note: Existing global rates (tenant_id=NULL) will remain for backward compatibility
    # Each tenant can create their own rates by populating tenant_id


def downgrade() -> None:
    # Drop unique constraint
    op.drop_constraint("uq_vat_rates_tenant_country", "vat_rates_by_country", type_="unique")

    # Restore old unique constraint on country_code
    op.create_unique_constraint(
        "vat_rates_by_country_country_code_key",
        "vat_rates_by_country",
        ["country_code"],
    )

    # Drop index
    op.drop_index("ix_vat_rates_by_country_tenant_id", table_name="vat_rates_by_country")

    # Drop foreign key
    op.drop_constraint(
        "fk_vat_rates_by_country_tenant_id",
        "vat_rates_by_country",
        type_="foreignkey",
    )

    # Drop column
    op.drop_column("vat_rates_by_country", "tenant_id")
