"""Add registration replacements tracking.

Revision ID: 125
Revises: 124
Create Date: 2026-03-08

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision = "125"
down_revision = "124"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add registration_replacements table for tracking attendee replacements."""
    op.create_table(
        "registration_replacements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("conference_id", UUID(as_uuid=True), nullable=False),
        sa.Column("old_registration_id", UUID(as_uuid=True), nullable=False),
        sa.Column("old_attendee_email", sa.String(255), nullable=False),
        sa.Column("old_attendee_name", sa.String(500), nullable=False),
        sa.Column("new_registration_id", UUID(as_uuid=True), nullable=False),
        sa.Column("additional_items_invoice_id", UUID(as_uuid=True), nullable=True),
        sa.Column("replacement_reason", sa.String(1000), nullable=True),
        sa.Column("has_additional_items", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("replaced_by_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("replaced_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("old_items_snapshot", JSONB, nullable=True),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name="fk_registration_replacements_tenant",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["conference_id"],
            ["conferences.id"],
            name="fk_registration_replacements_conference",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["old_registration_id"],
            ["registrations.id"],
            name="fk_registration_replacements_old_reg",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["new_registration_id"],
            ["registrations.id"],
            name="fk_registration_replacements_new_reg",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["additional_items_invoice_id"],
            ["invoices.id"],
            name="fk_registration_replacements_invoice",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["replaced_by_user_id"],
            ["users.id"],
            name="fk_registration_replacements_user",
            ondelete="SET NULL",
        ),
    )

    # Create indexes for common queries
    op.create_index(
        "idx_registration_replacements_old_reg",
        "registration_replacements",
        ["old_registration_id"],
    )
    op.create_index(
        "idx_registration_replacements_new_reg",
        "registration_replacements",
        ["new_registration_id"],
    )
    op.create_index(
        "idx_registration_replacements_conference",
        "registration_replacements",
        ["conference_id"],
    )
    op.create_index(
        "idx_registration_replacements_replaced_at",
        "registration_replacements",
        ["replaced_at"],
    )
    op.create_index(
        "idx_registration_replacements_tenant",
        "registration_replacements",
        ["tenant_id"],
    )


def downgrade() -> None:
    """Remove registration_replacements table."""
    op.drop_index("idx_registration_replacements_tenant", table_name="registration_replacements")
    op.drop_index("idx_registration_replacements_replaced_at", table_name="registration_replacements")
    op.drop_index("idx_registration_replacements_conference", table_name="registration_replacements")
    op.drop_index("idx_registration_replacements_new_reg", table_name="registration_replacements")
    op.drop_index("idx_registration_replacements_old_reg", table_name="registration_replacements")
    op.drop_table("registration_replacements")
