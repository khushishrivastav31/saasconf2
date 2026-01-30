"""Unify committee members with applicants: add applicant_id FK, role, expertise_areas; drop name/email/phone/password_hash.

Revision ID: 038_unify_committee_applicant
Revises: 037_applicant_portal
Create Date: 2026-01-29

"""

from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

# revision identifiers, used by Alembic.
revision: str = "038_unify_committee_applicant"
down_revision: Union[str, None] = "037_applicant_portal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add new columns (applicant_id nullable at first for data migration)
    op.add_column(
        "cfp_committee_members",
        sa.Column("applicant_id", UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "cfp_committee_members",
        sa.Column("role", sa.String(50), nullable=False, server_default="reviewer"),
    )
    op.add_column(
        "cfp_committee_members",
        sa.Column("expertise_areas", JSONB, nullable=False, server_default="[]"),
    )

    # 2a. Match existing committee members to applicants by email (same tenant, case-insensitive)
    op.execute("""
        UPDATE cfp_committee_members cm
        SET applicant_id = a.id
        FROM cfp_applicants a
        WHERE cm.tenant_id = a.tenant_id
          AND LOWER(TRIM(cm.email)) = LOWER(TRIM(a.email))
    """)

    # 2b. Create new applicant records for unmatched committee members
    op.execute("""
        INSERT INTO cfp_applicants (id, tenant_id, name, email, phone, password_hash,
            allow_out_of_timeframe, social_links, needs_accessibility, agrees_to_recording,
            created_at, updated_at)
        SELECT gen_random_uuid(), cm.tenant_id, cm.name, cm.email, cm.phone, cm.password_hash,
            false, '{}'::jsonb, false, false,
            cm.created_at, cm.updated_at
        FROM cfp_committee_members cm
        WHERE cm.applicant_id IS NULL
    """)

    # 2c. Link the newly created applicants
    op.execute("""
        UPDATE cfp_committee_members cm
        SET applicant_id = a.id
        FROM cfp_applicants a
        WHERE cm.tenant_id = a.tenant_id
          AND LOWER(TRIM(cm.email)) = LOWER(TRIM(a.email))
          AND cm.applicant_id IS NULL
    """)

    # 3. Make applicant_id NOT NULL
    op.alter_column("cfp_committee_members", "applicant_id", nullable=False)

    # 4. Add foreign key constraint
    op.create_foreign_key(
        "fk_cfp_committee_members_applicant",
        "cfp_committee_members",
        "cfp_applicants",
        ["applicant_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    # 5. Add unique constraint (one committee membership per applicant per tenant)
    op.create_unique_constraint(
        "uq_committee_member_tenant_applicant",
        "cfp_committee_members",
        ["tenant_id", "applicant_id"],
    )

    # 6. Add index on applicant_id
    op.create_index(
        "idx_cfp_committee_members_applicant",
        "cfp_committee_members",
        ["applicant_id"],
    )

    # 7. Remap committee_member attachments to applicant_picture
    op.execute("""
        UPDATE attachments a
        SET entity_type = 'applicant_picture',
            entity_id = cm.applicant_id
        FROM cfp_committee_members cm
        WHERE a.entity_type = 'committee_member'
          AND a.entity_id = cm.id
    """)

    # 8. Drop old columns
    op.drop_column("cfp_committee_members", "name")
    op.drop_column("cfp_committee_members", "email")
    op.drop_column("cfp_committee_members", "phone")
    op.drop_column("cfp_committee_members", "password_hash")


def downgrade() -> None:
    # 1. Re-add old columns
    op.add_column(
        "cfp_committee_members",
        sa.Column("name", sa.String(255), nullable=True),
    )
    op.add_column(
        "cfp_committee_members",
        sa.Column("email", sa.String(255), nullable=True),
    )
    op.add_column(
        "cfp_committee_members",
        sa.Column("phone", sa.String(50), nullable=True),
    )
    op.add_column(
        "cfp_committee_members",
        sa.Column("password_hash", sa.String(255), nullable=True),
    )

    # 2. Populate from linked applicant
    op.execute("""
        UPDATE cfp_committee_members cm
        SET name = a.name,
            email = a.email,
            phone = a.phone,
            password_hash = a.password_hash
        FROM cfp_applicants a
        WHERE cm.applicant_id = a.id
    """)

    # 3. Make name/email/password_hash NOT NULL
    op.alter_column("cfp_committee_members", "name", nullable=False)
    op.alter_column("cfp_committee_members", "email", nullable=False)
    op.alter_column("cfp_committee_members", "password_hash", nullable=False)

    # 4. Remap applicant_picture attachments back (best-effort)
    op.execute("""
        UPDATE attachments a
        SET entity_type = 'committee_member',
            entity_id = cm.id
        FROM cfp_committee_members cm
        WHERE a.entity_type = 'applicant_picture'
          AND a.entity_id = cm.applicant_id
    """)

    # 5. Drop new constraints and columns
    op.drop_index("idx_cfp_committee_members_applicant", table_name="cfp_committee_members")
    op.drop_constraint("uq_committee_member_tenant_applicant", "cfp_committee_members", type_="unique")
    op.drop_constraint("fk_cfp_committee_members_applicant", "cfp_committee_members", type_="foreignkey")
    op.drop_column("cfp_committee_members", "expertise_areas")
    op.drop_column("cfp_committee_members", "role")
    op.drop_column("cfp_committee_members", "applicant_id")
