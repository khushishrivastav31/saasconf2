"""Unified portal users — shared login for conferences and trainings.

Creates portal_users table + portal_refresh_tokens table.
Adds portal_user_id FK to cfp_applicants and training_attendees.
Migrates existing cfp_applicant accounts to portal_users.

Revision ID: 192
Revises: 191
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "192"
down_revision = "191"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create portal_users table
    op.create_table(
        "portal_users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("first_name", sa.String(255), nullable=False),
        sa.Column("last_name", sa.String(255), nullable=False, server_default=""),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("uq_portal_users_tenant_email", "portal_users", ["tenant_id", "email"], unique=True)
    op.create_index("idx_portal_users_tenant", "portal_users", ["tenant_id"])

    # 2. Create portal_refresh_tokens table
    op.create_table(
        "portal_refresh_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "portal_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("portal_users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_portal_refresh_tokens_user", "portal_refresh_tokens", ["portal_user_id"])

    # 3. Add portal_user_id FK to cfp_applicants
    op.add_column("cfp_applicants", sa.Column("portal_user_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_cfp_applicants_portal_user",
        "cfp_applicants",
        "portal_users",
        ["portal_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # 4. Add portal_user_id FK to training_attendees
    op.add_column("training_attendees", sa.Column("portal_user_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_training_attendees_portal_user",
        "training_attendees",
        "portal_users",
        ["portal_user_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # 5. Migrate existing cfp_applicant accounts to portal_users
    # For each cfp_applicant with a password_hash, create a portal_user and link them
    op.execute("""
        INSERT INTO portal_users (id, tenant_id, email, password_hash, first_name, last_name, phone,
                                  email_verified_at, is_active, created_at, updated_at)
        SELECT gen_random_uuid(), tenant_id, email, password_hash, first_name, last_name, phone,
               email_verified_at, true, created_at, updated_at
        FROM cfp_applicants
        WHERE password_hash IS NOT NULL AND password_hash != ''
        ON CONFLICT (tenant_id, email) DO NOTHING
    """)

    # Link cfp_applicants to their portal_users
    op.execute("""
        UPDATE cfp_applicants ca
        SET portal_user_id = pu.id
        FROM portal_users pu
        WHERE ca.tenant_id = pu.tenant_id
          AND lower(ca.email) = lower(pu.email)
          AND ca.portal_user_id IS NULL
    """)


def downgrade() -> None:
    # Remove FKs
    op.drop_constraint("fk_training_attendees_portal_user", "training_attendees", type_="foreignkey")
    op.drop_column("training_attendees", "portal_user_id")

    op.drop_constraint("fk_cfp_applicants_portal_user", "cfp_applicants", type_="foreignkey")
    op.drop_column("cfp_applicants", "portal_user_id")

    # Drop tables
    op.drop_table("portal_refresh_tokens")
    op.drop_table("portal_users")
