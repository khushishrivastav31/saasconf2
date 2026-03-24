"""Make conference_id nullable on tenant_location_types for training-scoped types.

Revision ID: 164
Revises: 163
Create Date: 2026-03-24
"""

from alembic import op

revision = "164"
down_revision = "163"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Make conference_id nullable so location types can be tenant-level (for trainings)
    op.alter_column("tenant_location_types", "conference_id", nullable=True)
    # Drop the old unique index and recreate with a partial index for NULL conference_id
    op.drop_index("idx_tenant_location_types_slug", table_name="tenant_location_types")
    # Unique slug per tenant+conference (for conference-scoped types)
    op.create_index(
        "idx_tenant_location_types_slug_conf",
        "tenant_location_types",
        ["tenant_id", "conference_id", "slug"],
        unique=True,
        postgresql_where="conference_id IS NOT NULL",
    )
    # Unique slug per tenant (for tenant-level types, i.e. training types)
    op.create_index(
        "idx_tenant_location_types_slug_tenant",
        "tenant_location_types",
        ["tenant_id", "slug"],
        unique=True,
        postgresql_where="conference_id IS NULL",
    )


def downgrade() -> None:
    op.drop_index("idx_tenant_location_types_slug_tenant", table_name="tenant_location_types")
    op.drop_index("idx_tenant_location_types_slug_conf", table_name="tenant_location_types")
    op.create_index(
        "idx_tenant_location_types_slug",
        "tenant_location_types",
        ["tenant_id", "conference_id", "slug"],
        unique=True,
    )
    op.alter_column("tenant_location_types", "conference_id", nullable=False)
