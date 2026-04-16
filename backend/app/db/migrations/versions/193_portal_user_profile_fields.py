"""Add profile fields to portal_users — pronouns, title, company, bio, etc.

Matches the conference applicant profile fields for parity.

Revision ID: 193
Revises: 192
"""

import sqlalchemy as sa
from alembic import op

revision = "193"
down_revision = "192"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("portal_users", sa.Column("pronouns", sa.String(100), nullable=True))
    op.add_column("portal_users", sa.Column("title", sa.String(255), nullable=True))
    op.add_column("portal_users", sa.Column("company", sa.String(255), nullable=True))
    op.add_column("portal_users", sa.Column("bio", sa.Text, nullable=True))
    op.add_column("portal_users", sa.Column("social_links", sa.JSON, nullable=True, server_default="{}"))
    op.add_column("portal_users", sa.Column("address_line_1", sa.String(500), nullable=True))
    op.add_column("portal_users", sa.Column("address_line_2", sa.String(500), nullable=True))
    op.add_column("portal_users", sa.Column("city", sa.String(255), nullable=True))
    op.add_column("portal_users", sa.Column("postal_code", sa.String(20), nullable=True))
    op.add_column("portal_users", sa.Column("country", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("portal_users", "country")
    op.drop_column("portal_users", "postal_code")
    op.drop_column("portal_users", "city")
    op.drop_column("portal_users", "address_line_2")
    op.drop_column("portal_users", "address_line_1")
    op.drop_column("portal_users", "social_links")
    op.drop_column("portal_users", "bio")
    op.drop_column("portal_users", "company")
    op.drop_column("portal_users", "title")
    op.drop_column("portal_users", "pronouns")
