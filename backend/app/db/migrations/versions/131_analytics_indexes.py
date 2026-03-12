"""Add performance indexes for analytics queries.

Revision ID: 131
Revises: 130
"""

from alembic import op

revision = "131"
down_revision = "130"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "idx_invoices_source_type_status",
        "invoices",
        ["conference_id", "recipient_source_type", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_invoices_source_type_status", table_name="invoices")
