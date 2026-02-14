"""Add booking packages tables.

Booking packages are bundles of booking options.
Package prices are calculated dynamically by summing component option prices.

Revision ID: 063_booking_packages
Revises: 0c871280ae81
Create Date: 2026-02-11

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "063_booking_packages"
down_revision: str | None = "0c871280ae81"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create booking_packages and booking_package_options tables."""
    # Create booking_packages table
    op.create_table(
        "booking_packages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conference_id", UUID(as_uuid=True), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # Create indexes for booking_packages
    op.create_index("idx_booking_packages_tenant", "booking_packages", ["tenant_id"])
    op.create_index("idx_booking_packages_conference", "booking_packages", ["conference_id"])
    op.create_index(
        "idx_booking_packages_name",
        "booking_packages",
        ["tenant_id", "conference_id", "name"],
        unique=True,
    )

    # Create booking_package_options junction table
    op.create_table(
        "booking_package_options",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("booking_package_id", UUID(as_uuid=True), sa.ForeignKey("booking_packages.id", ondelete="CASCADE"), nullable=False),
        sa.Column("booking_option_id", UUID(as_uuid=True), sa.ForeignKey("booking_options.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # Create indexes for booking_package_options
    op.create_index("idx_booking_package_options_tenant", "booking_package_options", ["tenant_id"])
    op.create_index("idx_booking_package_options_package", "booking_package_options", ["booking_package_id"])
    op.create_index("idx_booking_package_options_option", "booking_package_options", ["booking_option_id"])
    op.create_index(
        "uq_booking_package_option",
        "booking_package_options",
        ["booking_package_id", "booking_option_id"],
        unique=True,
    )


def downgrade() -> None:
    """Drop booking_packages and booking_package_options tables."""
    op.drop_table("booking_package_options")
    op.drop_table("booking_packages")
