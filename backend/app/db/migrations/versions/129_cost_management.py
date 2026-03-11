"""Add cost management tables: budgets, speaker expenses, allowances.

Budget Planning: budget_categories, budgets, budget_line_items
Speaker Expenses: expense_categories, speaker_expenses, speaker_expense_allowance_defaults,
                  speaker_expense_allowances

Revision ID: 129
Revises: 128
"""

import sqlalchemy as sa
from alembic import op

revision = "129"
down_revision = "128"
branch_labels = None
depends_on = None


def _enable_rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(
        f"""
        CREATE POLICY tenant_isolation ON {table}
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
        """
    )


def _disable_rls(table: str) -> None:
    op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
    op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")


def upgrade() -> None:
    # ── Budget Categories ──
    op.create_table(
        "budget_categories",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conference_id", sa.UUID(), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("conference_id", "name", name="uq_budget_category_conference_name"),
    )
    op.create_index("idx_budget_categories_tenant_conf", "budget_categories", ["tenant_id", "conference_id"])
    _enable_rls("budget_categories")

    # ── Budgets ──
    op.create_table(
        "budgets",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conference_id", sa.UUID(), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("total_planned", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("total_actual", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="EUR"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_budgets_tenant", "budgets", ["tenant_id"])
    op.create_index("idx_budgets_tenant_conf_status", "budgets", ["tenant_id", "conference_id", "status"])
    _enable_rls("budgets")

    # ── Budget Line Items ──
    op.create_table(
        "budget_line_items",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("budget_id", sa.UUID(), sa.ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category_id", sa.UUID(), sa.ForeignKey("budget_categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("planned_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("actual_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("vendor_name", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_budget_line_items_tenant", "budget_line_items", ["tenant_id"])
    op.create_index("idx_budget_line_items_budget", "budget_line_items", ["budget_id"])
    op.create_index("idx_budget_line_items_category", "budget_line_items", ["category_id"])
    _enable_rls("budget_line_items")

    # ── Expense Categories ──
    op.create_table(
        "expense_categories",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conference_id", sa.UUID(), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("conference_id", "name", name="uq_expense_category_conference_name"),
    )
    op.create_index("idx_expense_categories_tenant_conf", "expense_categories", ["tenant_id", "conference_id"])
    _enable_rls("expense_categories")

    # ── Speaker Expense Allowance Defaults (per session type per conference) ──
    op.create_table(
        "speaker_expense_allowance_defaults",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conference_id", sa.UUID(), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_type_id", sa.UUID(), sa.ForeignKey("session_types.id", ondelete="CASCADE"), nullable=False),
        sa.Column("max_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="EUR"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("conference_id", "session_type_id", name="uq_allowance_default_conf_session_type"),
    )
    op.create_index(
        "idx_allowance_defaults_tenant_conf",
        "speaker_expense_allowance_defaults",
        ["tenant_id", "conference_id"],
    )
    _enable_rls("speaker_expense_allowance_defaults")

    # ── Speaker Expense Allowances (per speaker per conference) ──
    op.create_table(
        "speaker_expense_allowances",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conference_id", sa.UUID(), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "cfp_applicant_id", sa.UUID(), sa.ForeignKey("cfp_applicants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("max_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="EUR"),
        sa.Column("source", sa.String(20), nullable=False, server_default="auto"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("conference_id", "cfp_applicant_id", name="uq_allowance_conf_applicant"),
    )
    op.create_index("idx_allowances_tenant_conf", "speaker_expense_allowances", ["tenant_id", "conference_id"])
    op.create_index("idx_allowances_applicant", "speaker_expense_allowances", ["cfp_applicant_id"])
    _enable_rls("speaker_expense_allowances")

    # ── Speaker Expenses ──
    op.create_table(
        "speaker_expenses",
        sa.Column("id", sa.UUID(), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", sa.UUID(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conference_id", sa.UUID(), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "cfp_applicant_id", sa.UUID(), sa.ForeignKey("cfp_applicants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("speaker_name", sa.String(255), nullable=False),
        # Expense details
        sa.Column("category_id", sa.UUID(), sa.ForeignKey("expense_categories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("expense_date", sa.Date(), nullable=False),
        # Multi-currency
        sa.Column("original_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("original_currency", sa.String(3), nullable=False),
        sa.Column("converted_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("conference_currency", sa.String(3), nullable=True),
        sa.Column("exchange_rate", sa.Numeric(12, 6), nullable=True),
        # Assignment
        sa.Column("session_id", sa.UUID(), sa.ForeignKey("program_sessions.id", ondelete="SET NULL"), nullable=True),
        # Approval workflow
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("approved_by", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("payment_reference", sa.String(255), nullable=True),
        # Metadata
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_speaker_expenses_tenant", "speaker_expenses", ["tenant_id"])
    op.create_index("idx_speaker_expenses_conf_status", "speaker_expenses", ["tenant_id", "conference_id", "status"])
    op.create_index("idx_speaker_expenses_applicant", "speaker_expenses", ["cfp_applicant_id"])
    op.create_index("idx_speaker_expenses_category", "speaker_expenses", ["category_id"])
    op.create_index("idx_speaker_expenses_session", "speaker_expenses", ["session_id"])
    _enable_rls("speaker_expenses")


def downgrade() -> None:
    tables = [
        "speaker_expenses",
        "speaker_expense_allowances",
        "speaker_expense_allowance_defaults",
        "expense_categories",
        "budget_line_items",
        "budgets",
        "budget_categories",
    ]
    for table in tables:
        _disable_rls(table)
        # Drop all indexes for table
        for idx in sa.inspect(op.get_bind()).get_indexes(table):
            op.drop_index(idx["name"], table_name=table)
        op.drop_table(table)
