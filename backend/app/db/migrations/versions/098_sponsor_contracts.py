"""Sponsor contracts with versioning.

Revision ID: 098_sponsor_contracts
Revises: 097_discount_code_enhancements
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "098_sponsor_contracts"
down_revision = "097_discount_code_enhancements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- sponsor_contracts (current contract, 1:1 with sponsor) ----------------
    op.create_table(
        "sponsor_contracts",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "sponsor_id",
            UUID(as_uuid=True),
            sa.ForeignKey("sponsors.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "conference_id", UUID(as_uuid=True), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("source_package_id", UUID(as_uuid=True), nullable=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("file_data", sa.LargeBinary, nullable=True),
        sa.Column("file_size", sa.Integer, nullable=False),
        sa.Column("html_content", sa.Text, nullable=True),
        sa.Column("is_editable", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("version", sa.Integer, server_default=sa.text("1"), nullable=False),
        sa.Column("status", sa.String(20), server_default=sa.text("'draft'"), nullable=False),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_to", JSONB, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_index("idx_sponsor_contracts_tenant", "sponsor_contracts", ["tenant_id"])
    op.create_index("idx_sponsor_contracts_conference", "sponsor_contracts", ["tenant_id", "conference_id"])

    # -- sponsor_contract_versions (historical snapshots) ----------------------
    op.create_table(
        "sponsor_contract_versions",
        sa.Column("id", UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column(
            "contract_id",
            UUID(as_uuid=True),
            sa.ForeignKey("sponsor_contracts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("html_content", sa.Text, nullable=True),
        sa.Column("file_data", sa.LargeBinary, nullable=True),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("file_size", sa.Integer, nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_index("idx_contract_versions_contract", "sponsor_contract_versions", ["contract_id", "version"])

    # -- RLS -------------------------------------------------------------------
    op.execute("ALTER TABLE sponsor_contracts ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON sponsor_contracts
            USING (
                tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
                OR current_setting('app.is_super_admin', true) = 'true'
            )
        """
    )

    # Versions inherit access through the contract join; apply a permissive policy
    # that allows access when the parent contract is visible.
    op.execute("ALTER TABLE sponsor_contract_versions ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON sponsor_contract_versions
            USING (
                EXISTS (
                    SELECT 1 FROM sponsor_contracts sc
                    WHERE sc.id = sponsor_contract_versions.contract_id
                )
            )
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON sponsor_contract_versions")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON sponsor_contracts")
    op.drop_table("sponsor_contract_versions")
    op.drop_table("sponsor_contracts")
