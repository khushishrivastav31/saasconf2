"""Add conference_id to cfp_committee_members to scope membership per conference.

Revision ID: 039_committee_conference_scope
Revises: 038_unify_committee_applicant
Create Date: 2026-01-29

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "039_committee_conference_scope"
down_revision: Union[str, None] = "038_unify_committee_applicant"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add conference_id column (nullable at first for data migration)
    op.add_column(
        "cfp_committee_members",
        sa.Column("conference_id", UUID(as_uuid=True), nullable=True),
    )

    # 2. Assign existing committee members to the first conference in their tenant
    op.execute("""
        UPDATE cfp_committee_members cm
        SET conference_id = sub.first_conf
        FROM (
            SELECT DISTINCT ON (t.id) t.id AS tenant_id, c.id AS first_conf
            FROM tenants t
            JOIN conferences c ON c.tenant_id = t.id
            ORDER BY t.id, c.created_at ASC
        ) sub
        WHERE cm.tenant_id = sub.tenant_id
          AND cm.conference_id IS NULL
    """)

    # 3. Make conference_id NOT NULL
    op.alter_column("cfp_committee_members", "conference_id", nullable=False)

    # 4. Add foreign key constraint
    op.create_foreign_key(
        "fk_cfp_committee_members_conference",
        "cfp_committee_members",
        "conferences",
        ["conference_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # 5. Drop old unique constraint (tenant_id, applicant_id) — a person can now
    #    be a committee member in multiple conferences
    op.drop_constraint(
        "uq_committee_member_tenant_applicant",
        "cfp_committee_members",
        type_="unique",
    )

    # 6. Add new unique constraint (tenant_id, conference_id, applicant_id)
    op.create_unique_constraint(
        "uq_committee_member_conference_applicant",
        "cfp_committee_members",
        ["tenant_id", "conference_id", "applicant_id"],
    )

    # 7. Add index on conference_id
    op.create_index(
        "idx_cfp_committee_members_conference",
        "cfp_committee_members",
        ["conference_id"],
    )


def downgrade() -> None:
    # 1. Drop new index and constraints
    op.drop_index("idx_cfp_committee_members_conference", table_name="cfp_committee_members")
    op.drop_constraint("uq_committee_member_conference_applicant", "cfp_committee_members", type_="unique")
    op.drop_constraint("fk_cfp_committee_members_conference", "cfp_committee_members", type_="foreignkey")

    # 2. Delete duplicate memberships (keep the earliest per tenant+applicant)
    op.execute("""
        DELETE FROM cfp_committee_members
        WHERE id NOT IN (
            SELECT DISTINCT ON (tenant_id, applicant_id) id
            FROM cfp_committee_members
            ORDER BY tenant_id, applicant_id, created_at ASC
        )
    """)

    # 3. Re-add old unique constraint
    op.create_unique_constraint(
        "uq_committee_member_tenant_applicant",
        "cfp_committee_members",
        ["tenant_id", "applicant_id"],
    )

    # 4. Drop conference_id column
    op.drop_column("cfp_committee_members", "conference_id")
