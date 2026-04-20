"""Enable RLS on 8 tenant-scoped tables that were missing a policy.

Audit in April 2026 surfaced that these tables carry ``tenant_id`` but
had no row-level policy attached — the application-layer filter was
the sole line of defence. Adds the standard ``tenant_isolation_<table>``
policy used elsewhere in the codebase (see migration 205), matching on
``app.current_tenant_id`` with the ``app.is_super_admin`` escape hatch
for migrations and scripts.

Tables protected:
    - portal_users
    - training_attendees
    - cfp_applicants
    - billing_profiles
    - conferences
    - cfp_papers
    - registrations

``cfp_paper_cospeakers`` is intentionally excluded: it is a pure M2M
table without its own ``tenant_id`` column, so the standard policy
shape (``tenant_id = current_setting(...)``) does not apply. Protection
for that table requires an ``EXISTS``-based policy against its parent
(``cfp_papers``) and is tracked as a follow-up.

Revision ID: 206
Revises: 205
"""

from alembic import op

revision = "206"
down_revision = "205"
branch_labels = None
depends_on = None


TABLES = (
    "portal_users",
    "training_attendees",
    "cfp_applicants",
    "billing_profiles",
    "conferences",
    "cfp_papers",
    "registrations",
)


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"""CREATE POLICY tenant_isolation_{table} ON {table}
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
                   OR current_setting('app.is_super_admin', true) = 'true')"""
        )


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
