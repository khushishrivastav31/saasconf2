"""Create offer_placements join table and backfill from existing FK links.

Revision ID: 177
Revises: 176
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "177"
down_revision = "176"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "offer_placements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "offer_id", UUID(as_uuid=True), sa.ForeignKey("customer_offers.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "placement_id",
            UUID(as_uuid=True),
            sa.ForeignKey("program_year_trainings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("offer_id", "placement_id", name="uq_offer_placement"),
    )
    op.create_index("idx_offer_placements_tenant", "offer_placements", ["tenant_id"])
    op.create_index("idx_offer_placements_offer", "offer_placements", ["offer_id"])
    op.create_index("idx_offer_placements_placement", "offer_placements", ["placement_id"])

    # RLS
    op.execute("ALTER TABLE offer_placements ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON offer_placements "
        "USING (tenant_id = current_setting('app.current_tenant_id')::uuid)"
    )

    # Backfill: create offer_placement rows from existing program_year_trainings.offer_id links
    op.execute(
        "INSERT INTO offer_placements (id, tenant_id, offer_id, placement_id) "
        "SELECT gen_random_uuid(), tenant_id, offer_id, id "
        "FROM program_year_trainings "
        "WHERE offer_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON offer_placements")
    op.drop_table("offer_placements")
