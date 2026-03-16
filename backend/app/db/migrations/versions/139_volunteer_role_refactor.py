"""Refactor volunteers to use role-based system.

Creates volunteer_profiles table, migrates volunteer_assignments FK from
volunteers.id to cfp_applicants.id, migrates existing data, and drops
the old volunteers + conference_volunteers tables.

Revision ID: 139
Revises: 138
Create Date: 2026-03-16
"""

import json
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "139"
down_revision = "138"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---------------------------------------------------------------
    # 1. Create volunteer_profiles table
    # ---------------------------------------------------------------
    op.create_table(
        "volunteer_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column(
            "tenant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("tenants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conference_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conferences.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "applicant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("cfp_applicants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tshirt_size", sa.String(10), nullable=True),
        sa.Column("emergency_contact_name", sa.String(255), nullable=True),
        sa.Column("emergency_contact_phone", sa.String(50), nullable=True),
        sa.Column("skills", sa.dialects.postgresql.JSONB, server_default="[]", nullable=False),
        sa.Column("availability", sa.dialects.postgresql.JSONB, server_default="{}", nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("total_hours", sa.Float, server_default="0.0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "conference_id", "applicant_id", name="uq_volunteer_profile"),
    )

    op.create_index("idx_vp_tenant", "volunteer_profiles", ["tenant_id"])
    op.create_index("idx_vp_conference", "volunteer_profiles", ["conference_id"])
    op.create_index("idx_vp_applicant", "volunteer_profiles", ["applicant_id"])

    # RLS policy
    op.execute("ALTER TABLE volunteer_profiles ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY volunteer_profiles_tenant_isolation ON volunteer_profiles
        USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
        """
    )

    # ---------------------------------------------------------------
    # 2. Add applicant_id column to volunteer_assignments (nullable initially)
    # ---------------------------------------------------------------
    op.add_column(
        "volunteer_assignments",
        sa.Column(
            "applicant_id",
            UUID(as_uuid=True),
            sa.ForeignKey("cfp_applicants.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )

    # ---------------------------------------------------------------
    # 3. Data migration: map volunteers -> cfp_applicants
    # ---------------------------------------------------------------
    conn = op.get_bind()

    # Get all volunteers
    volunteers = conn.execute(
        sa.text(
            "SELECT id, tenant_id, email, first_name, last_name, phone, "
            "tshirt_size, emergency_contact_name, emergency_contact_phone, "
            "skills, availability, notes, total_hours FROM volunteers"
        )
    ).fetchall()

    # Map volunteer_id -> applicant_id
    vol_to_applicant: dict[uuid.UUID, uuid.UUID] = {}

    for vol in volunteers:
        # Find existing applicant by email + tenant
        existing = conn.execute(
            sa.text("SELECT id FROM cfp_applicants WHERE tenant_id = :tid AND email = :email LIMIT 1"),
            {"tid": vol.tenant_id, "email": vol.email},
        ).fetchone()

        if existing:
            applicant_id = existing.id
        else:
            # Create new CFPApplicant
            applicant_id = uuid.uuid4()
            # password_hash is NOT NULL; use an unusable placeholder so they
            # must reset their password to log in.
            placeholder_hash = "$2b$12$000000000000000000000000000000000000000000"
            conn.execute(
                sa.text(
                    "INSERT INTO cfp_applicants (id, tenant_id, email, first_name, last_name, phone, password_hash, created_at) "
                    "VALUES (:id, :tid, :email, :fn, :ln, :phone, :pw, now())"
                ),
                {
                    "id": applicant_id,
                    "tid": vol.tenant_id,
                    "email": vol.email,
                    "fn": vol.first_name,
                    "ln": vol.last_name,
                    "phone": vol.phone,
                    "pw": placeholder_hash,
                },
            )

        vol_to_applicant[vol.id] = applicant_id

    # Get all conference_volunteers and create UserRoleAssignments + VolunteerProfiles
    conf_vols = conn.execute(sa.text("SELECT volunteer_id, conference_id, color FROM conference_volunteers")).fetchall()

    for cv in conf_vols:
        applicant_id = vol_to_applicant.get(cv.volunteer_id)
        if not applicant_id:
            continue

        # Get tenant_id from the conference
        conf_row = conn.execute(
            sa.text("SELECT tenant_id FROM conferences WHERE id = :cid"),
            {"cid": cv.conference_id},
        ).fetchone()
        if not conf_row:
            continue
        tenant_id = conf_row.tenant_id

        # Find or create "Volunteer" UserRole for this conference
        role_row = conn.execute(
            sa.text("SELECT id FROM user_roles WHERE conference_id = :cid AND name = 'Volunteer' LIMIT 1"),
            {"cid": cv.conference_id},
        ).fetchone()

        if not role_row:
            role_id = uuid.uuid4()
            conn.execute(
                sa.text(
                    "INSERT INTO user_roles (id, tenant_id, conference_id, name, is_system, is_active, created_at) "
                    "VALUES (:id, :tid, :cid, 'Volunteer', true, true, now())"
                ),
                {"id": role_id, "tid": tenant_id, "cid": cv.conference_id},
            )
        else:
            role_id = role_row.id

        # Create UserRoleAssignment (skip if exists)
        existing_assign = conn.execute(
            sa.text("SELECT id FROM user_role_assignments WHERE user_role_id = :rid AND applicant_id = :aid LIMIT 1"),
            {"rid": role_id, "aid": applicant_id},
        ).fetchone()
        if not existing_assign:
            conn.execute(
                sa.text(
                    "INSERT INTO user_role_assignments (id, tenant_id, user_role_id, applicant_id, created_at) "
                    "VALUES (:id, :tid, :rid, :aid, now())"
                ),
                {"id": uuid.uuid4(), "tid": tenant_id, "rid": role_id, "aid": applicant_id},
            )

        # Find original volunteer data for profile
        vol_data = None
        for v in volunteers:
            if v.id == cv.volunteer_id:
                vol_data = v
                break

        # Create VolunteerProfile
        existing_profile = conn.execute(
            sa.text("SELECT id FROM volunteer_profiles WHERE conference_id = :cid AND applicant_id = :aid LIMIT 1"),
            {"cid": cv.conference_id, "aid": applicant_id},
        ).fetchone()
        if not existing_profile and vol_data:
            conn.execute(
                sa.text(
                    "INSERT INTO volunteer_profiles "
                    "(id, tenant_id, conference_id, applicant_id, tshirt_size, "
                    "emergency_contact_name, emergency_contact_phone, skills, availability, "
                    "notes, color, total_hours, created_at, updated_at) "
                    "VALUES (:id, :tid, :cid, :aid, :ts, :ecn, :ecp, "
                    ":skills\\:\\:jsonb, :avail\\:\\:jsonb, "
                    ":notes, :color, :hours, now(), now())"
                ),
                {
                    "id": uuid.uuid4(),
                    "tid": tenant_id,
                    "cid": cv.conference_id,
                    "aid": applicant_id,
                    "ts": vol_data.tshirt_size if vol_data else None,
                    "ecn": vol_data.emergency_contact_name if vol_data else None,
                    "ecp": vol_data.emergency_contact_phone if vol_data else None,
                    "skills": json.dumps(vol_data.skills if vol_data else []),
                    "avail": json.dumps(vol_data.availability if vol_data else {}),
                    "notes": vol_data.notes if vol_data else None,
                    "color": cv.color,
                    "hours": vol_data.total_hours if vol_data else 0.0,
                },
            )

    # Update volunteer_assignments.applicant_id from the mapping
    for vol_id, app_id in vol_to_applicant.items():
        conn.execute(
            sa.text("UPDATE volunteer_assignments SET applicant_id = :aid WHERE volunteer_id = :vid"),
            {"aid": app_id, "vid": vol_id},
        )

    # ---------------------------------------------------------------
    # 4. Drop old FK + column, make applicant_id NOT NULL
    # ---------------------------------------------------------------
    # Drop old unique constraint and indexes
    op.drop_constraint("uq_volunteer_assignment", "volunteer_assignments", type_="unique")
    op.drop_index("idx_va_volunteer", table_name="volunteer_assignments")

    # Drop old FK (named by convention)
    op.drop_constraint("volunteer_assignments_volunteer_id_fkey", "volunteer_assignments", type_="foreignkey")
    op.drop_column("volunteer_assignments", "volunteer_id")

    # Make applicant_id NOT NULL
    op.alter_column("volunteer_assignments", "applicant_id", nullable=False)

    # New unique constraint and index
    op.create_unique_constraint(
        "uq_volunteer_assignment", "volunteer_assignments", ["session_volunteer_task_id", "applicant_id"]
    )
    op.create_index("idx_va_applicant", "volunteer_assignments", ["applicant_id"])

    # ---------------------------------------------------------------
    # 5. Drop old tables
    # ---------------------------------------------------------------
    op.execute("DROP POLICY IF EXISTS conference_volunteers_tenant_isolation ON conference_volunteers")
    op.drop_table("conference_volunteers")

    op.execute("DROP POLICY IF EXISTS volunteers_tenant_isolation ON volunteers")
    op.drop_table("volunteers")


def downgrade() -> None:
    # This is a complex data migration — downgrade recreates empty tables
    op.create_table(
        "volunteers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("role", sa.String(100), nullable=True),
        sa.Column("skills", sa.dialects.postgresql.JSONB, server_default="[]"),
        sa.Column("availability", sa.dialects.postgresql.JSONB, server_default="{}"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("emergency_contact_name", sa.String(255), nullable=True),
        sa.Column("emergency_contact_phone", sa.String(50), nullable=True),
        sa.Column("tshirt_size", sa.String(10), nullable=True),
        sa.Column("application_date", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("approved_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_hours", sa.Float, server_default="0.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "conference_volunteers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "conference_id", UUID(as_uuid=True), sa.ForeignKey("conferences.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "volunteer_id", UUID(as_uuid=True), sa.ForeignKey("volunteers.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("conference_id", "volunteer_id", name="uq_conference_volunteer"),
    )

    # Re-add volunteer_id to volunteer_assignments
    op.add_column(
        "volunteer_assignments",
        sa.Column("volunteer_id", UUID(as_uuid=True), nullable=True),
    )
    op.drop_constraint("uq_volunteer_assignment", "volunteer_assignments", type_="unique")
    op.drop_index("idx_va_applicant", table_name="volunteer_assignments")
    op.drop_column("volunteer_assignments", "applicant_id")

    # Drop volunteer_profiles
    op.execute("DROP POLICY IF EXISTS volunteer_profiles_tenant_isolation ON volunteer_profiles")
    op.drop_table("volunteer_profiles")
