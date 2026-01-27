"""Add conference_id to service_providers, make location_id nullable.

Revision ID: 012_service_providers_conference
Revises: 011_service_providers
Create Date: 2026-01-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = "012_service_providers_conference"
down_revision = "011_service_providers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Make location_id nullable (service providers can belong to a conference instead)
    op.alter_column("service_providers", "location_id", nullable=True)

    # Add conference_id FK
    op.add_column(
        "service_providers",
        sa.Column(
            "conference_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )

    # Add index for conference-scoped queries
    op.create_index(
        "idx_service_providers_conference",
        "service_providers",
        ["tenant_id", "conference_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_service_providers_conference", table_name="service_providers")
    op.drop_column("service_providers", "conference_id")
    op.alter_column("service_providers", "location_id", nullable=False)
