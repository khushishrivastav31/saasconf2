"""Add cfp_committee_roles settings table and normalize existing role values.

Revision ID: 040_committee_role_settings
Revises: 039_committee_conference_scope
Create Date: 2026-01-29

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "040_committee_role_settings"
down_revision: Union[str, None] = "039_committee_conference_scope"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create cfp_committee_roles table
    op.create_table(
        "cfp_committee_roles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conference_id", UUID(as_uuid=True), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index("idx_cfp_committee_roles_tenant", "cfp_committee_roles", ["tenant_id"])
    op.create_index("idx_cfp_committee_roles_conference", "cfp_committee_roles", ["conference_id"])
    op.create_index(
        "idx_cfp_committee_roles_name",
        "cfp_committee_roles",
        ["tenant_id", "conference_id", "name"],
        unique=True,
    )

    # 2. Seed default roles for every existing conference
    op.execute("""
        INSERT INTO cfp_committee_roles (id, tenant_id, conference_id, name, is_active)
        SELECT gen_random_uuid(), c.tenant_id, c.id, r.role_name, true
        FROM conferences c
        CROSS JOIN (VALUES ('Chair'), ('Reviewer'), ('Track Chair'), ('Emeritus')) AS r(role_name)
    """)

    # 3. Normalize existing role values to human-readable names
    op.execute("UPDATE cfp_committee_members SET role = 'Chair' WHERE role = 'chair'")
    op.execute("UPDATE cfp_committee_members SET role = 'Reviewer' WHERE role = 'reviewer'")
    op.execute("UPDATE cfp_committee_members SET role = 'Track Chair' WHERE role = 'track_chair'")
    op.execute("UPDATE cfp_committee_members SET role = 'Emeritus' WHERE role = 'emeritus'")


def downgrade() -> None:
    # 1. Revert role values to snake_case
    op.execute("UPDATE cfp_committee_members SET role = 'chair' WHERE role = 'Chair'")
    op.execute("UPDATE cfp_committee_members SET role = 'reviewer' WHERE role = 'Reviewer'")
    op.execute("UPDATE cfp_committee_members SET role = 'track_chair' WHERE role = 'Track Chair'")
    op.execute("UPDATE cfp_committee_members SET role = 'emeritus' WHERE role = 'Emeritus'")

    # 2. Drop table and indexes
    op.drop_index("idx_cfp_committee_roles_name", table_name="cfp_committee_roles")
    op.drop_index("idx_cfp_committee_roles_conference", table_name="cfp_committee_roles")
    op.drop_index("idx_cfp_committee_roles_tenant", table_name="cfp_committee_roles")
    op.drop_table("cfp_committee_roles")
