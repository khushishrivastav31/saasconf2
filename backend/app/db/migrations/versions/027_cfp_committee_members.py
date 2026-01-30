"""Add cfp_committee_members table.

Revision ID: 027_cfp_committee_members
Revises: 026_cfp_topics
Create Date: 2026-01-28
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "027_cfp_committee_members"
down_revision = "026_cfp_topics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cfp_committee_members",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("idx_cfp_committee_members_tenant", "cfp_committee_members", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("idx_cfp_committee_members_tenant")
    op.drop_table("cfp_committee_members")
