"""Create customers and inhouse_trainings tables.

Revision ID: 170
Revises: 169
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "170"
down_revision = "169"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Customers ────────────────────────────────────────────────
    op.create_table(
        "customers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("contact_person", sa.String(200), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("address_line1", sa.String(200), nullable=True),
        sa.Column("address_line2", sa.String(200), nullable=True),
        sa.Column("city", sa.String(100), nullable=True),
        sa.Column("postal_code", sa.String(20), nullable=True),
        sa.Column("country", sa.String(2), nullable=True),
        sa.Column("vat_number", sa.String(50), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "name", name="uq_customer_tenant_name"),
    )
    op.create_index("idx_customers_tenant", "customers", ["tenant_id"])

    # RLS for customers
    op.execute("ALTER TABLE customers ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON customers USING (tenant_id = current_setting('app.current_tenant_id')::uuid)"
    )

    # ── Inhouse Trainings ────────────────────────────────────────
    op.create_table(
        "inhouse_trainings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("customer_id", UUID(as_uuid=True), sa.ForeignKey("customers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("training_id", UUID(as_uuid=True), sa.ForeignKey("trainings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trainer_id", UUID(as_uuid=True), sa.ForeignKey("trainers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("offer_id", UUID(as_uuid=True), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("training_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("certification_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("comments", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_inhouse_tenant", "inhouse_trainings", ["tenant_id"])
    op.create_index("idx_inhouse_customer", "inhouse_trainings", ["customer_id"])
    op.create_index("idx_inhouse_training", "inhouse_trainings", ["training_id"])
    op.create_index("idx_inhouse_start_date", "inhouse_trainings", ["tenant_id", "start_date"])

    # RLS for inhouse_trainings
    op.execute("ALTER TABLE inhouse_trainings ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON inhouse_trainings "
        "USING (tenant_id = current_setting('app.current_tenant_id')::uuid)"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON inhouse_trainings")
    op.drop_table("inhouse_trainings")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON customers")
    op.drop_table("customers")
