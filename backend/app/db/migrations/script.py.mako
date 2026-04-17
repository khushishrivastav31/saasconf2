"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    # RLS reminder: if this migration creates a new table with a tenant_id column,
    # also enable Row-Level Security and create tenant isolation policies, e.g.:
    #
    #   op.execute("ALTER TABLE my_new_table ENABLE ROW LEVEL SECURITY")
    #   op.execute(
    #       "CREATE POLICY tenant_isolation ON my_new_table "
    #       "USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)"
    #   )
    #
    # tests/test_rls_coverage.py will fail CI if you forget.
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
