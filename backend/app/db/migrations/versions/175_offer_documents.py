"""Create offer_documents and offer_document_versions tables.

Revision ID: 175
Revises: 174
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "175"
down_revision = "174"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Offer Documents ──────────────────────────────────────────────
    op.create_table(
        "offer_documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "offer_id", UUID(as_uuid=True), sa.ForeignKey("customer_offers.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=True),
        sa.Column("file_data", sa.LargeBinary(), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("html_content", sa.Text(), nullable=True),
        sa.Column("is_editable", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("status", sa.String(20), server_default="draft", nullable=False),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_to", sa.dialects.postgresql.JSONB(), nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_offer_documents_tenant", "offer_documents", ["tenant_id"])
    op.create_index("idx_offer_documents_offer", "offer_documents", ["offer_id"])

    # RLS for offer_documents
    op.execute("ALTER TABLE offer_documents ENABLE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON offer_documents "
        "USING (tenant_id = current_setting('app.current_tenant_id')::uuid)"
    )

    # ── Offer Document Versions ──────────────────────────────────────
    op.create_table(
        "offer_document_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "document_id",
            UUID(as_uuid=True),
            sa.ForeignKey("offer_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("html_content", sa.Text(), nullable=True),
        sa.Column("file_data", sa.LargeBinary(), nullable=True),
        sa.Column("content_type", sa.String(100), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_offer_doc_versions_document", "offer_document_versions", ["document_id", "version"])

    # RLS for offer_document_versions (via document → offer → tenant)
    # No tenant_id on versions table — RLS not needed as access is gated through offer_documents


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON offer_documents")
    op.drop_table("offer_document_versions")
    op.drop_table("offer_documents")
