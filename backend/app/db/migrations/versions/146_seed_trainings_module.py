"""Seed the 'trainings' module and assign it to all existing tenants.

Revision ID: 146_seed_trainings_module
Revises: 145_user_tenant_roles
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "146"
down_revision: str = "145"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    # Insert the module if it doesn't already exist (idempotent)
    exists = conn.execute(sa.text("SELECT 1 FROM modules WHERE code = 'trainings'")).fetchone()
    if not exists:
        conn.execute(
            sa.text(
                "INSERT INTO modules (id, code, name, description, is_active, config_schema) "
                "VALUES (gen_random_uuid(), 'trainings', 'Training Management', "
                "'Manage trainings, trainers, syllabi, registrations, and scheduling.', true, '{}'::jsonb)"
            )
        )

    # Assign to all existing tenants (same pattern as migration 133)
    conn.execute(
        sa.text(
            """
            INSERT INTO tenant_modules (id, tenant_id, module_id, is_enabled, granted_at)
            SELECT
                gen_random_uuid(),
                t.id,
                m.id,
                TRUE,
                NOW()
            FROM tenants t
            CROSS JOIN modules m
            WHERE m.code = 'trainings'
              AND m.is_active = TRUE
              AND NOT EXISTS (
                  SELECT 1 FROM tenant_modules tm
                  WHERE tm.tenant_id = t.id AND tm.module_id = m.id
              )
            """
        )
    )


def downgrade() -> None:
    op.execute("DELETE FROM tenant_modules WHERE module_id IN (SELECT id FROM modules WHERE code = 'trainings')")
    op.execute("DELETE FROM modules WHERE code = 'trainings'")
