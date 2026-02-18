"""Applicant portal: email verification, unique constraints, token tables.

Revision ID: 037_applicant_portal
Revises: 036_cospeaker_invitations
Create Date: 2026-01-28

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "037_applicant_portal"
down_revision: Union[str, None] = "036_cospeaker_invitations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add email_verified_at to cfp_applicants
    op.add_column(
        "cfp_applicants",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )

    # 2. Add unique constraint (tenant_id, abbreviation) on conferences
    op.create_unique_constraint(
        "uq_conferences_tenant_abbreviation",
        "conferences",
        ["tenant_id", "abbreviation"],
    )

    # 3. Add unique constraint (tenant_id, email) on cfp_applicants
    op.create_unique_constraint(
        "uq_cfp_applicants_tenant_email",
        "cfp_applicants",
        ["tenant_id", "email"],
    )

    # 4. Create applicant_refresh_tokens table
    op.create_table(
        "applicant_refresh_tokens",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "applicant_id", UUID(as_uuid=True), sa.ForeignKey("cfp_applicants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("token_hash", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_applicant_refresh_token_hash", "applicant_refresh_tokens", ["token_hash"])
    op.create_index("idx_applicant_refresh_token_applicant", "applicant_refresh_tokens", ["applicant_id"])

    # 5. Create applicant_email_verifications table
    op.create_table(
        "applicant_email_verifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "applicant_id", UUID(as_uuid=True), sa.ForeignKey("cfp_applicants.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_applicant_email_verification_hash", "applicant_email_verifications", ["token_hash"])
    op.create_index("idx_applicant_email_verification_applicant", "applicant_email_verifications", ["applicant_id"])


def downgrade() -> None:
    op.drop_table("applicant_email_verifications")
    op.drop_table("applicant_refresh_tokens")
    op.drop_constraint("uq_cfp_applicants_tenant_email", "cfp_applicants", type_="unique")
    op.drop_constraint("uq_conferences_tenant_abbreviation", "conferences", type_="unique")
    op.drop_column("cfp_applicants", "email_verified_at")
