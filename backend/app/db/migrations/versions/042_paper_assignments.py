"""Add cfp_paper_assignments table for paper-to-committee-member assignment.

Revision ID: 042_paper_assignments
Revises: 041_conference_venue_type
Create Date: 2026-01-29

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "042_paper_assignments"
down_revision: Union[str, None] = "041_conference_venue_type"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cfp_paper_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "paper_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cfp_papers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "committee_member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("cfp_committee_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("is_anonymous", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_unique_constraint(
        "uq_paper_assignment_paper_member", "cfp_paper_assignments", ["paper_id", "committee_member_id"]
    )
    op.create_index("idx_paper_assignments_tenant", "cfp_paper_assignments", ["tenant_id"])
    op.create_index("idx_paper_assignments_paper", "cfp_paper_assignments", ["paper_id"])
    op.create_index("idx_paper_assignments_member", "cfp_paper_assignments", ["committee_member_id"])

    # Enable RLS
    op.execute("ALTER TABLE cfp_paper_assignments ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON cfp_paper_assignments "
        "USING (tenant_id = current_setting('app.current_tenant_id')::uuid)"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON cfp_paper_assignments")
    op.drop_table("cfp_paper_assignments")
