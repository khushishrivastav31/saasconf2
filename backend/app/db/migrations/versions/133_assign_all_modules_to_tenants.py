"""Assign all active modules to every existing tenant.

Every tenant now gets all modules by default. This migration backfills
tenant_modules rows for any (tenant, module) pair that doesn't already exist.

Revision ID: 133
Revises: 132
"""

from alembic import op

revision = "133"
down_revision = "132"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
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
        WHERE m.is_active = TRUE
          AND NOT EXISTS (
              SELECT 1 FROM tenant_modules tm
              WHERE tm.tenant_id = t.id AND tm.module_id = m.id
          )
        """
    )


def downgrade() -> None:
    # No-op: removing modules would break tenant access
    pass
