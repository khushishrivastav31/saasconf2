"""Create offer_attendees table.

Revision ID: 176
Revises: 175
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "176"
down_revision = "175"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "offer_attendees",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "offer_id", UUID(as_uuid=True), sa.ForeignKey("customer_offers.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "placement_id",
            UUID(as_uuid=True),
            sa.ForeignKey("program_year_trainings.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("first_name", sa.String(200), nullable=False),
        sa.Column("last_name", sa.String(200), nullable=False),
        sa.Column("email", sa.String(320), nullable=True),
        sa.Column("certification", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("exam_mode", sa.String(20), nullable=True),
        sa.Column("extra_time", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("exam_language", sa.String(50), nullable=True),
        sa.Column("comments", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_offer_attendees_tenant", "offer_attendees", ["tenant_id"])
    op.create_index("idx_offer_attendees_offer", "offer_attendees", ["offer_id"])
    op.create_index("idx_offer_attendees_placement", "offer_attendees", ["placement_id"])

    # RLS
    op.execute("ALTER TABLE offer_attendees ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON offer_attendees "
        "USING (tenant_id = current_setting('app.current_tenant_id')::uuid)"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON offer_attendees")
    op.drop_table("offer_attendees")
