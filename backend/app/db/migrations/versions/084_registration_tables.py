"""Create billing_profiles, registrations, and registration_items tables.

Revision ID: 084_registration_tables
Revises: 083_seed_registration_module
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "084_registration_tables"
down_revision: str = "083_seed_registration_module"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # -- billing_profiles --
    op.create_table(
        "billing_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("company_name", sa.String(255), nullable=True),
        sa.Column("street", sa.String(500), nullable=False),
        sa.Column("postal_code", sa.String(20), nullable=False),
        sa.Column("city", sa.String(255), nullable=False),
        sa.Column("country", sa.String(100), nullable=False),
        sa.Column("contact_person_name", sa.String(255), nullable=False),
        sa.Column("contact_phone", sa.String(50), nullable=False),
        sa.Column("contact_email", sa.String(255), nullable=False),
        sa.Column("vat_number", sa.String(50), nullable=True),
        sa.Column("procurement_code", sa.String(100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("idx_billing_profiles_tenant", "billing_profiles", ["tenant_id"])
    op.create_index("idx_billing_profiles_conference", "billing_profiles", ["conference_id"])
    op.create_index(
        "idx_billing_profiles_tenant_conference",
        "billing_profiles",
        ["tenant_id", "conference_id"],
    )

    # -- registrations --
    op.create_table(
        "registrations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "billing_profile_id",
            UUID(as_uuid=True),
            sa.ForeignKey("billing_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # Attendee person data
        sa.Column("first_name", sa.String(255), nullable=False),
        sa.Column("last_name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("job_title", sa.String(255), nullable=True),
        sa.Column("department", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        # Base package
        sa.Column(
            "booking_package_id",
            UUID(as_uuid=True),
            sa.ForeignKey("booking_packages.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        # Metadata
        sa.Column("registration_mode", sa.String(20), nullable=False),
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="registered_pending_invoice",
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("idx_registrations_tenant", "registrations", ["tenant_id"])
    op.create_index("idx_registrations_conference", "registrations", ["conference_id"])
    op.create_index(
        "idx_registrations_tenant_conference",
        "registrations",
        ["tenant_id", "conference_id"],
    )
    op.create_index(
        "idx_registrations_billing_profile",
        "registrations",
        ["billing_profile_id"],
    )
    op.create_index(
        "idx_registrations_status",
        "registrations",
        ["conference_id", "status"],
    )
    op.create_index(
        "uq_registrations_email_conference",
        "registrations",
        ["conference_id", "email"],
        unique=True,
    )

    # -- registration_items (add-ons: tutorials, extra days, etc.) --
    op.create_table(
        "registration_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "registration_id",
            UUID(as_uuid=True),
            sa.ForeignKey("registrations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("item_type", sa.String(20), nullable=False),
        sa.Column(
            "booking_option_id",
            UUID(as_uuid=True),
            sa.ForeignKey("booking_options.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "program_session_id",
            UUID(as_uuid=True),
            sa.ForeignKey("program_sessions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("item_name", sa.String(500), nullable=False),
        sa.Column("pending", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("idx_registration_items_tenant", "registration_items", ["tenant_id"])
    op.create_index(
        "idx_registration_items_registration",
        "registration_items",
        ["registration_id"],
    )
    op.create_index(
        "idx_registration_items_type",
        "registration_items",
        ["registration_id", "item_type"],
    )


def downgrade() -> None:
    op.drop_index("idx_registration_items_type", table_name="registration_items")
    op.drop_index("idx_registration_items_registration", table_name="registration_items")
    op.drop_index("idx_registration_items_tenant", table_name="registration_items")
    op.drop_table("registration_items")

    op.drop_index("uq_registrations_email_conference", table_name="registrations")
    op.drop_index("idx_registrations_status", table_name="registrations")
    op.drop_index("idx_registrations_billing_profile", table_name="registrations")
    op.drop_index("idx_registrations_tenant_conference", table_name="registrations")
    op.drop_index("idx_registrations_conference", table_name="registrations")
    op.drop_index("idx_registrations_tenant", table_name="registrations")
    op.drop_table("registrations")

    op.drop_index("idx_billing_profiles_tenant_conference", table_name="billing_profiles")
    op.drop_index("idx_billing_profiles_conference", table_name="billing_profiles")
    op.drop_index("idx_billing_profiles_tenant", table_name="billing_profiles")
    op.drop_table("billing_profiles")
