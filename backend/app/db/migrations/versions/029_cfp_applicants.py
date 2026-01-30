"""Add cfp_applicants table.

Revision ID: 029_cfp_applicants
Revises: 028_committee_member_topics
Create Date: 2026-01-28
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "029_cfp_applicants"
down_revision = "028_committee_member_topics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cfp_applicants",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("title", sa.String(255), nullable=True),
        sa.Column("company", sa.String(255), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("idx_cfp_applicants_tenant", "cfp_applicants", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("idx_cfp_applicants_tenant")
    op.drop_table("cfp_applicants")
