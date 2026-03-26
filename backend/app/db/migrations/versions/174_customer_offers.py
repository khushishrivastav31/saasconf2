"""Create customer_offers table and add offer_id/customer_id to program_year_trainings.

Revision ID: 174
Revises: 173
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "174"
down_revision = "173"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Customer Offers ──────────────────────────────────────────────
    op.create_table(
        "customer_offers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("customer_id", UUID(as_uuid=True), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("offer_number", sa.String(50), nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("attendees", sa.Integer(), nullable=True),
        sa.Column("training_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("certification_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(3), server_default="EUR", nullable=False),
        sa.Column("comments", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "offer_number", name="uq_offer_tenant_number"),
    )
    op.create_index("idx_customer_offers_tenant", "customer_offers", ["tenant_id"])
    op.create_index("idx_customer_offers_customer", "customer_offers", ["customer_id"])
    op.create_index("idx_customer_offers_status", "customer_offers", ["status"])

    # RLS for customer_offers
    op.execute("ALTER TABLE customer_offers ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON customer_offers "
        "USING (tenant_id = current_setting('app.current_tenant_id')::uuid)"
    )

    # ── Add offer_id and customer_id to program_year_trainings ───────
    op.add_column(
        "program_year_trainings",
        sa.Column(
            "offer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("customer_offers.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "program_year_trainings",
        sa.Column(
            "customer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("customers.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("idx_pyt_offer", "program_year_trainings", ["offer_id"])
    op.create_index("idx_pyt_customer", "program_year_trainings", ["customer_id"])


def downgrade() -> None:
    op.drop_index("idx_pyt_customer", table_name="program_year_trainings")
    op.drop_index("idx_pyt_offer", table_name="program_year_trainings")
    op.drop_column("program_year_trainings", "customer_id")
    op.drop_column("program_year_trainings", "offer_id")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON customer_offers")
    op.drop_table("customer_offers")
