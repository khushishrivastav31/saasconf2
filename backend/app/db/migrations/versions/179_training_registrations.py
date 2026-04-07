"""Create training_registrations and training_registration_attendees tables.

Revision ID: 179
Revises: 178
"""

import sqlalchemy as sa
from alembic import op

revision = "179"
down_revision = "178"


def upgrade() -> None:
    op.create_table(
        "training_registrations",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "placement_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("program_year_trainings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="registered"),
        # Billing
        sa.Column("company_name", sa.String(255), nullable=True),
        sa.Column("street", sa.String(255), nullable=False),
        sa.Column("postal_code", sa.String(20), nullable=False),
        sa.Column("city", sa.String(100), nullable=False),
        sa.Column("country", sa.String(2), nullable=False),
        sa.Column("vat_number", sa.String(50), nullable=True),
        # Contact
        sa.Column("contact_first_name", sa.String(100), nullable=False),
        sa.Column("contact_last_name", sa.String(100), nullable=False),
        sa.Column("contact_email", sa.String(255), nullable=False),
        sa.Column("contact_phone", sa.String(50), nullable=True),
        # Payment
        sa.Column("payment_method", sa.String(20), nullable=False, server_default="bank_transfer"),
        sa.Column("payment_intent_id", sa.String(255), nullable=True),
        # Pricing
        sa.Column("discount_code", sa.String(50), nullable=True),
        sa.Column("discount_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=True),
        sa.Column("vat_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("total", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="EUR"),
        # Notes
        sa.Column("notes", sa.Text, nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    op.create_index("idx_training_reg_tenant", "training_registrations", ["tenant_id"])
    op.create_index("idx_training_reg_placement", "training_registrations", ["placement_id"])
    op.create_index("idx_training_reg_status", "training_registrations", ["status"])
    op.create_index("idx_training_reg_contact_email", "training_registrations", ["contact_email"])

    # RLS policy
    op.execute(
        "ALTER TABLE training_registrations ENABLE ROW LEVEL SECURITY"
    )
    op.execute(
        """CREATE POLICY training_registrations_tenant_isolation ON training_registrations
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid)"""
    )

    op.create_table(
        "training_registration_attendees",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "tenant_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "registration_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("training_registrations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_training_reg_att_tenant", "training_registration_attendees", ["tenant_id"])
    op.create_index("idx_training_reg_att_reg", "training_registration_attendees", ["registration_id"])

    # RLS policy
    op.execute(
        "ALTER TABLE training_registration_attendees ENABLE ROW LEVEL SECURITY"
    )
    op.execute(
        """CREATE POLICY training_reg_att_tenant_isolation ON training_registration_attendees
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid)"""
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS training_reg_att_tenant_isolation ON training_registration_attendees")
    op.drop_table("training_registration_attendees")
    op.execute("DROP POLICY IF EXISTS training_registrations_tenant_isolation ON training_registrations")
    op.drop_table("training_registrations")
