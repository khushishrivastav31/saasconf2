"""Add contact_persons to locations table.

Revision ID: 010_location_contact_persons
Revises: 009_simplify_add_attachments
Create Date: 2026-01-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision = "010_location_contact_persons"
down_revision = "009_simplify_add_attachments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "locations",
        sa.Column("contact_persons", JSONB, nullable=True, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("locations", "contact_persons")
