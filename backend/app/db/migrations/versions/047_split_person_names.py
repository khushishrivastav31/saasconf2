"""Split person name fields into first_name + last_name.

Revision ID: 047_split_person_names
Revises: 046_review_form_settings
Create Date: 2026-01-30

"""
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "047_split_person_names"
down_revision: Union[str, None] = "046_review_form_settings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ---------------------------------------------------------------------------
# Helper: SQL to split a name column by first space
# first_name = first word, last_name = everything after first space (or '')
# ---------------------------------------------------------------------------
_SPLIT_FIRST = "split_part({col}, ' ', 1)"
_SPLIT_LAST = (
    "CASE WHEN position(' ' IN {col}) > 0 "
    "THEN substring({col} FROM position(' ' IN {col}) + 1) "
    "ELSE '' END"
)

# JSONB helper: rewrite array elements, replacing "name" key with first_name + last_name
_JSONB_REWRITE = """
UPDATE {table} SET {col} = (
  SELECT jsonb_agg(
    jsonb_set(
      jsonb_set(
        elem - 'name',
        '{{first_name}}',
        to_jsonb(split_part(elem->>'name', ' ', 1))
      ),
      '{{last_name}}',
      to_jsonb(
        CASE WHEN position(' ' IN elem->>'name') > 0
        THEN substring(elem->>'name' FROM position(' ' IN elem->>'name') + 1)
        ELSE '' END
      )
    )
  ) FROM jsonb_array_elements({col}) AS elem
)
WHERE {col} IS NOT NULL
  AND jsonb_typeof({col}) = 'array'
  AND jsonb_array_length({col}) > 0;
"""

# Reverse JSONB: merge first_name + last_name back into "name"
_JSONB_REVERSE = """
UPDATE {table} SET {col} = (
  SELECT jsonb_agg(
    jsonb_set(
      (elem - 'first_name') - 'last_name',
      '{{name}}',
      to_jsonb(
        CASE WHEN (elem->>'last_name') IS NOT NULL AND (elem->>'last_name') != ''
        THEN (elem->>'first_name') || ' ' || (elem->>'last_name')
        ELSE COALESCE(elem->>'first_name', '')
        END
      )
    )
  ) FROM jsonb_array_elements({col}) AS elem
)
WHERE {col} IS NOT NULL
  AND jsonb_typeof({col}) = 'array'
  AND jsonb_array_length({col}) > 0;
"""


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. users: full_name -> first_name + last_name
    # ------------------------------------------------------------------
    op.add_column("users", sa.Column("first_name", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("last_name", sa.String(255), nullable=True))
    op.execute(
        f"UPDATE users SET first_name = {_SPLIT_FIRST.format(col='full_name')}, "
        f"last_name = {_SPLIT_LAST.format(col='full_name')} "
        f"WHERE full_name IS NOT NULL"
    )
    op.drop_column("users", "full_name")

    # ------------------------------------------------------------------
    # 2. cfp_applicants: name -> first_name + last_name
    # ------------------------------------------------------------------
    op.add_column("cfp_applicants", sa.Column("first_name", sa.String(255), nullable=True))
    op.add_column("cfp_applicants", sa.Column("last_name", sa.String(255), nullable=True))
    op.execute(
        f"UPDATE cfp_applicants SET first_name = {_SPLIT_FIRST.format(col='name')}, "
        f"last_name = {_SPLIT_LAST.format(col='name')}"
    )
    op.alter_column("cfp_applicants", "first_name", nullable=False)
    op.alter_column("cfp_applicants", "last_name", nullable=False)
    op.drop_column("cfp_applicants", "name")

    # ------------------------------------------------------------------
    # 3. submissions: speaker_name -> speaker_first_name + speaker_last_name
    # ------------------------------------------------------------------
    op.add_column("submissions", sa.Column("speaker_first_name", sa.String(255), nullable=True))
    op.add_column("submissions", sa.Column("speaker_last_name", sa.String(255), nullable=True))
    op.execute(
        f"UPDATE submissions SET "
        f"speaker_first_name = {_SPLIT_FIRST.format(col='speaker_name')}, "
        f"speaker_last_name = {_SPLIT_LAST.format(col='speaker_name')}"
    )
    op.alter_column("submissions", "speaker_first_name", nullable=False)
    op.alter_column("submissions", "speaker_last_name", nullable=False)
    op.drop_column("submissions", "speaker_name")

    # ------------------------------------------------------------------
    # 4. JSONB: conference team_members
    # ------------------------------------------------------------------
    op.execute(_JSONB_REWRITE.format(table="conferences", col="team_members"))

    # ------------------------------------------------------------------
    # 5. JSONB: contact_persons on multiple tables
    # ------------------------------------------------------------------
    for table in ("tenants", "invoices", "locations", "service_providers", "sponsors"):
        op.execute(_JSONB_REWRITE.format(table=table, col="contact_persons"))


def downgrade() -> None:
    # ------------------------------------------------------------------
    # 1. users: first_name + last_name -> full_name
    # ------------------------------------------------------------------
    op.add_column("users", sa.Column("full_name", sa.String(255), nullable=True))
    op.execute(
        "UPDATE users SET full_name = "
        "CASE WHEN last_name IS NOT NULL AND last_name != '' "
        "THEN first_name || ' ' || last_name "
        "ELSE first_name END "
        "WHERE first_name IS NOT NULL"
    )
    op.drop_column("users", "first_name")
    op.drop_column("users", "last_name")

    # ------------------------------------------------------------------
    # 2. cfp_applicants: first_name + last_name -> name
    # ------------------------------------------------------------------
    op.add_column("cfp_applicants", sa.Column("name", sa.String(255), nullable=True))
    op.execute(
        "UPDATE cfp_applicants SET name = "
        "CASE WHEN last_name != '' "
        "THEN first_name || ' ' || last_name "
        "ELSE first_name END"
    )
    op.alter_column("cfp_applicants", "name", nullable=False)
    op.drop_column("cfp_applicants", "first_name")
    op.drop_column("cfp_applicants", "last_name")

    # ------------------------------------------------------------------
    # 3. submissions: speaker_first_name + speaker_last_name -> speaker_name
    # ------------------------------------------------------------------
    op.add_column("submissions", sa.Column("speaker_name", sa.String(255), nullable=True))
    op.execute(
        "UPDATE submissions SET speaker_name = "
        "CASE WHEN speaker_last_name != '' "
        "THEN speaker_first_name || ' ' || speaker_last_name "
        "ELSE speaker_first_name END"
    )
    op.alter_column("submissions", "speaker_name", nullable=False)
    op.drop_column("submissions", "speaker_first_name")
    op.drop_column("submissions", "speaker_last_name")

    # ------------------------------------------------------------------
    # 4. JSONB: conference team_members
    # ------------------------------------------------------------------
    op.execute(_JSONB_REVERSE.format(table="conferences", col="team_members"))

    # ------------------------------------------------------------------
    # 5. JSONB: contact_persons on multiple tables
    # ------------------------------------------------------------------
    for table in ("tenants", "invoices", "locations", "service_providers", "sponsors"):
        op.execute(_JSONB_REVERSE.format(table=table, col="contact_persons"))
