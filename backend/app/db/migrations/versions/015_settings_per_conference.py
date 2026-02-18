"""Move volunteer roles and location types from tenant-scoped to conference-scoped.

Revision ID: 015_settings_per_conference
Revises: 014_structured_address_vat
Create Date: 2026-01-27
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "015_settings_per_conference"
down_revision = "014_structured_address_vat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- Step 1: Add conference_id column (nullable for now) --
    op.add_column(
        "volunteer_roles",
        sa.Column("conference_id", UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "tenant_location_types",
        sa.Column("conference_id", UUID(as_uuid=True), nullable=True),
    )

    # -- Step 2: Migrate data — duplicate each role/type into every conference of the same tenant --
    conn = op.get_bind()

    # For volunteer_roles: for each existing row, find all conferences in that tenant
    # and create a copy for each conference (update the first, insert the rest).
    existing_roles = conn.execute(
        sa.text("SELECT id, tenant_id, name, description, is_active FROM volunteer_roles")
    ).fetchall()

    for role in existing_roles:
        conferences = conn.execute(
            sa.text("SELECT id FROM conferences WHERE tenant_id = :tid"),
            {"tid": role.tenant_id},
        ).fetchall()

        if conferences:
            # Assign the first conference to the original row
            conn.execute(
                sa.text("UPDATE volunteer_roles SET conference_id = :cid WHERE id = :rid"),
                {"cid": conferences[0].id, "rid": role.id},
            )
            # Duplicate for remaining conferences
            for conf in conferences[1:]:
                conn.execute(
                    sa.text(
                        "INSERT INTO volunteer_roles (id, tenant_id, conference_id, name, description, is_active, created_at, updated_at) "
                        "VALUES (gen_random_uuid(), :tid, :cid, :name, :desc, :active, now(), now())"
                    ),
                    {
                        "tid": role.tenant_id,
                        "cid": conf.id,
                        "name": role.name,
                        "desc": role.description,
                        "active": role.is_active,
                    },
                )

    # For tenant_location_types: same logic
    existing_types = conn.execute(
        sa.text("SELECT id, tenant_id, name, slug, description, is_active FROM tenant_location_types")
    ).fetchall()

    for loc_type in existing_types:
        conferences = conn.execute(
            sa.text("SELECT id FROM conferences WHERE tenant_id = :tid"),
            {"tid": loc_type.tenant_id},
        ).fetchall()

        if conferences:
            conn.execute(
                sa.text("UPDATE tenant_location_types SET conference_id = :cid WHERE id = :rid"),
                {"cid": conferences[0].id, "rid": loc_type.id},
            )
            for conf in conferences[1:]:
                conn.execute(
                    sa.text(
                        "INSERT INTO tenant_location_types (id, tenant_id, conference_id, name, slug, description, is_active, created_at, updated_at) "
                        "VALUES (gen_random_uuid(), :tid, :cid, :name, :slug, :desc, :active, now(), now())"
                    ),
                    {
                        "tid": loc_type.tenant_id,
                        "cid": conf.id,
                        "name": loc_type.name,
                        "slug": loc_type.slug,
                        "desc": loc_type.description,
                        "active": loc_type.is_active,
                    },
                )

    # -- Step 3: Delete orphan rows (tenants with no conferences) --
    conn.execute(sa.text("DELETE FROM volunteer_roles WHERE conference_id IS NULL"))
    conn.execute(sa.text("DELETE FROM tenant_location_types WHERE conference_id IS NULL"))

    # -- Step 4: Make conference_id NOT NULL --
    op.alter_column("volunteer_roles", "conference_id", nullable=False)
    op.alter_column("tenant_location_types", "conference_id", nullable=False)

    # -- Step 5: Add FK constraints --
    op.create_foreign_key(
        "fk_volunteer_roles_conference",
        "volunteer_roles",
        "conferences",
        ["conference_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_tenant_location_types_conference",
        "tenant_location_types",
        "conferences",
        ["conference_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # -- Step 6: Drop old unique indexes and create new ones --
    op.drop_index("idx_volunteer_roles_name", table_name="volunteer_roles")
    op.create_index(
        "idx_volunteer_roles_name",
        "volunteer_roles",
        ["tenant_id", "conference_id", "name"],
        unique=True,
    )
    op.create_index(
        "idx_volunteer_roles_conference",
        "volunteer_roles",
        ["conference_id"],
    )

    op.drop_index("idx_tenant_location_types_slug", table_name="tenant_location_types")
    op.create_index(
        "idx_tenant_location_types_slug",
        "tenant_location_types",
        ["tenant_id", "conference_id", "slug"],
        unique=True,
    )
    op.create_index(
        "idx_tenant_location_types_conference",
        "tenant_location_types",
        ["conference_id"],
    )


def downgrade() -> None:
    # Drop new indexes
    op.drop_index("idx_tenant_location_types_conference", table_name="tenant_location_types")
    op.drop_index("idx_tenant_location_types_slug", table_name="tenant_location_types")
    op.drop_index("idx_volunteer_roles_conference", table_name="volunteer_roles")
    op.drop_index("idx_volunteer_roles_name", table_name="volunteer_roles")

    # Recreate old unique indexes
    op.create_index(
        "idx_volunteer_roles_name",
        "volunteer_roles",
        ["tenant_id", "name"],
        unique=True,
    )
    op.create_index(
        "idx_tenant_location_types_slug",
        "tenant_location_types",
        ["tenant_id", "slug"],
        unique=True,
    )

    # Drop FK constraints
    op.drop_constraint("fk_tenant_location_types_conference", "tenant_location_types", type_="foreignkey")
    op.drop_constraint("fk_volunteer_roles_conference", "volunteer_roles", type_="foreignkey")

    # Drop conference_id columns
    op.drop_column("tenant_location_types", "conference_id")
    op.drop_column("volunteer_roles", "conference_id")
