"""Rename booking_packages to booking_options.

Revision ID: 057_booking_options
Revises: 056_applicant_activity_log
Create Date: 2026-02-11
"""

from alembic import op

revision = "057_booking_options"
down_revision = "056_applicant_activity_log"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename the table
    op.rename_table("booking_packages", "booking_options")

    # Rename indexes
    op.execute("ALTER INDEX idx_booking_packages_tenant RENAME TO idx_booking_options_tenant")
    op.execute("ALTER INDEX idx_booking_packages_conference RENAME TO idx_booking_options_conference")
    op.execute("ALTER INDEX idx_booking_packages_name RENAME TO idx_booking_options_name")

    # Rename the primary key constraint (PostgreSQL auto-names it based on table)
    op.execute("ALTER TABLE booking_options RENAME CONSTRAINT booking_packages_pkey TO booking_options_pkey")

    # Rename foreign key constraints
    op.execute(
        "ALTER TABLE booking_options RENAME CONSTRAINT booking_packages_tenant_id_fkey TO booking_options_tenant_id_fkey"
    )
    op.execute(
        "ALTER TABLE booking_options RENAME CONSTRAINT booking_packages_conference_id_fkey TO booking_options_conference_id_fkey"
    )

    # Rename RLS policy
    op.execute("ALTER POLICY booking_packages_tenant_isolation ON booking_options RENAME TO booking_options_tenant_isolation")


def downgrade() -> None:
    # Rename back to original
    op.rename_table("booking_options", "booking_packages")

    # Rename indexes back
    op.execute("ALTER INDEX idx_booking_options_tenant RENAME TO idx_booking_packages_tenant")
    op.execute("ALTER INDEX idx_booking_options_conference RENAME TO idx_booking_packages_conference")
    op.execute("ALTER INDEX idx_booking_options_name RENAME TO idx_booking_packages_name")

    # Rename the primary key constraint back
    op.execute("ALTER TABLE booking_packages RENAME CONSTRAINT booking_options_pkey TO booking_packages_pkey")

    # Rename foreign key constraints back
    op.execute(
        "ALTER TABLE booking_packages RENAME CONSTRAINT booking_options_tenant_id_fkey TO booking_packages_tenant_id_fkey"
    )
    op.execute(
        "ALTER TABLE booking_packages RENAME CONSTRAINT booking_options_conference_id_fkey TO booking_packages_conference_id_fkey"
    )

    # Rename RLS policy back
    op.execute("ALTER POLICY booking_options_tenant_isolation ON booking_packages RENAME TO booking_packages_tenant_isolation")
