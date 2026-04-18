"""Privacy request table for GDPR Art. 15 / 17 flows (phase 1).

Tracks data-subject access and erasure requests submitted by tenants on
behalf of their data subjects. One row per request. The request starts in
``pending_review`` and moves through approved/rejected/executing/completed.

Subject emails are held in an encrypted JSONB column (Fernet via app code)
to avoid plaintext storage of identifiers for subjects who may later ask
to be erased — if we stored them in the clear, the privacy-tooling table
itself would violate Art. 17 on erasure completion.

Revision ID: 201
Revises: 200
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "201"
down_revision = "200"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "privacy_requests",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("request_type", sa.String(20), nullable=False),
        sa.Column("subject_emails_encrypted", sa.Text, nullable=False),
        sa.Column("subject_email_hashes", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default=sa.text("'pending_review'"),
        ),
        sa.Column(
            "created_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "portal_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("portal_users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "reviewed_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completion_artifact_url", sa.Text, nullable=True),
        sa.Column("execution_manifest", JSONB, nullable=True),
        sa.Column("rejection_reason", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
    )
    op.create_index("idx_privacy_requests_tenant", "privacy_requests", ["tenant_id"])
    op.create_index(
        "idx_privacy_requests_status",
        "privacy_requests",
        ["tenant_id", "status"],
    )
    op.create_index("idx_privacy_requests_created", "privacy_requests", ["created_at"])
    op.create_index(
        "idx_privacy_requests_subject_hashes",
        "privacy_requests",
        ["subject_email_hashes"],
        postgresql_using="gin",
    )

    op.execute("ALTER TABLE privacy_requests ENABLE ROW LEVEL SECURITY")
    op.execute(
        """CREATE POLICY tenant_isolation_privacy_requests ON privacy_requests
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
               OR current_setting('app.is_super_admin', true) = 'true')"""
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_privacy_requests ON privacy_requests")
    op.execute("ALTER TABLE privacy_requests DISABLE ROW LEVEL SECURITY")
    op.drop_index("idx_privacy_requests_subject_hashes", table_name="privacy_requests")
    op.drop_index("idx_privacy_requests_created", table_name="privacy_requests")
    op.drop_index("idx_privacy_requests_status", table_name="privacy_requests")
    op.drop_index("idx_privacy_requests_tenant", table_name="privacy_requests")
    op.drop_table("privacy_requests")
