"""Add CHECK constraints for status/role enum columns.

The Python layer declares a ``StrEnum`` for each of these columns, but the
underlying Postgres column is plain ``VARCHAR``. That means any process that
writes with raw SQL — migrations, data fixes run from psql, a stray typo in
a future patch — can insert a value the application code will never match,
and the bug is silent until someone reads the row. Mirroring each enum as a
``CHECK`` constraint moves that guardrail into the database.

Enum value lists mirror the Python ``StrEnum`` classes as of 2026-04-17:
- ``registrations.status``      → ``RegistrationStatus``        (registration.py:18)
- ``invoices.status``           → ``{draft, sent, paid, overdue, cancelled}``
- ``call_for_papers.status``    → ``CFPStatus``                 (cfp.py:33)
- ``submissions.status``        → ``SubmissionStatus``          (cfp.py:43)
- ``cfp_papers.status``         → ``PaperStatus``               (cfp_papers.py:33)
- ``users.role``                → ``UserRole``                  (user.py:20)
- ``training_attendees.status`` → ``{active, parked}``

If you add a new value to one of these enums, add the value here too and
ship a new migration that drops the old constraint and re-adds it with the
extended list.

Revision ID: 194
Revises: 193
"""

from alembic import op

revision = "194"
down_revision = "193"
branch_labels = None
depends_on = None


_CHECKS: list[tuple[str, str, list[str]]] = [
    (
        "registrations",
        "ck_registrations_status",
        ["registered_pending_invoice", "invoiced", "paid", "cancelled"],
    ),
    (
        "invoices",
        "ck_invoices_status",
        ["draft", "sent", "paid", "overdue", "cancelled"],
    ),
    (
        "call_for_papers",
        "ck_call_for_papers_status",
        ["draft", "open", "closed", "review", "completed"],
    ),
    (
        "submissions",
        "ck_submissions_status",
        ["submitted", "under_review", "accepted", "rejected", "waitlisted", "withdrawn"],
    ),
    (
        "cfp_papers",
        "ck_cfp_papers_status",
        ["draft", "submitted", "in_evaluation", "evaluated", "final_consideration", "rejected", "accepted"],
    ),
    (
        "users",
        "ck_users_role",
        ["super_admin", "tenant_admin", "user"],
    ),
    (
        "training_attendees",
        "ck_training_attendees_status",
        ["active", "parked"],
    ),
]


def _column_for(table: str) -> str:
    return "role" if table == "users" else "status"


def upgrade() -> None:
    for table, constraint, values in _CHECKS:
        column = _column_for(table)
        value_list = ", ".join(f"'{v}'" for v in values)
        op.execute(f"ALTER TABLE {table} ADD CONSTRAINT {constraint} CHECK ({column} IN ({value_list}))")


def downgrade() -> None:
    for table, constraint, _values in _CHECKS:
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}")
