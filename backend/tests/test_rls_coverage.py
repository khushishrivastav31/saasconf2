"""CI guard: new tenant-scoped tables must ship with RLS enabled + a policy.

A table is considered tenant-scoped if it has a column literally named
`tenant_id`. The canonical multi-tenancy pattern in SaaSConf is:

    1. Add `tenant_id UUID NOT NULL REFERENCES tenants(id)` to the table.
    2. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
    3. `CREATE POLICY tenant_isolation ON ...
          USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)`.

Forgetting step 2 or 3 is a cross-tenant data-leak waiting to happen.

The current schema contains a backlog of tables that were created before
this guard existed and have a `tenant_id` column but no RLS. Rather than
block the backlog on a one-shot audit PR, we baseline those tables in
``KNOWN_RLS_GAPS_{ENABLE,POLICY}`` below. The test enforces that the set
of offenders is a **subset** of the baseline: existing gaps can be fixed
(the baseline may shrink), but NEW tables without RLS break CI.

When fixing a baselined table:
    1. Add RLS + policy in a migration.
    2. Remove the table from the corresponding baseline set below.

The suite-wide test DB (see `conftest.py`) is built from
`Base.metadata.create_all`, which does NOT run migration-level
`op.execute("ALTER TABLE ... ENABLE RLS")` statements. So this test builds
its own migrated DB inline (`saasconf_rls_check`), runs
`alembic upgrade head`, queries `pg_policies`, then drops the DB.
"""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

import psycopg2  # type: ignore[import-untyped]
import pytest
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT  # type: ignore[import-untyped]

# Tables that have `tenant_id` but do NOT yet have `ENABLE ROW LEVEL SECURITY`.
# Snapshotted 2026-04-17. Adding to this set is forbidden; removing is a win.
KNOWN_RLS_GAPS_ENABLE: frozenset[str] = frozenset(
    {
        "applicant_activity_logs",
        "billing_profiles",
        "booking_package_options",
        "booking_packages",
        "cfp_applicants",
        "cfp_committee_members",
        "cfp_committee_roles",
        "cfp_paper_comments",
        "cfp_papers",
        "cfp_topics",
        "conference_currencies",
        "conference_paper_form_schemas",
        "conferences",
        "dynamic_recipient_lists",
        "email_logs",
        "email_templates",
        "invoice_events",
        "news_articles",
        "paper_form_fields",
        "portal_users",
        "program_days",
        "program_sessions",
        "program_time_slots",
        "program_tracks",
        "pronoun_options",
        "registration_items",
        "registration_replacements",
        "registrations",
        "screen_overlays",
        "session_types",
        "sponsor_packages",
        "training_attendee_history",
        "training_attendees",
        "user_role_assignments",
        "user_roles",
        "vat_rates_by_country",
    }
)

# Tables that have `tenant_id` but no RLS policy at all. Superset of the
# enable-gap above (anything without RLS enabled also lacks a policy) plus a
# few tables that enable RLS without attaching a policy.
KNOWN_RLS_GAPS_POLICY: frozenset[str] = KNOWN_RLS_GAPS_ENABLE | frozenset(
    {
        "call_for_papers",
        "submissions",
    }
)

BACKEND_DIR = Path(__file__).resolve().parent.parent
RLS_DB_NAME = "saasconf_rls_check"


def _parse_dsn() -> dict[str, str]:
    url = os.environ["DATABASE_URL"].replace("+asyncpg", "").replace("postgresql://", "")
    creds, hostdb = url.split("@", 1)
    user, password = creds.split(":", 1)
    host_port, _current_db = hostdb.split("/", 1)
    host, port = ([*host_port.split(":", 1), "5432"])[:2]
    return {"host": host, "port": port, "user": user, "password": password}


@pytest.fixture(scope="module")
def migrated_db_dsn() -> Iterator[dict[str, str]]:
    """Create a fresh DB, alembic-upgrade it, yield a DSN, then drop it."""
    base = _parse_dsn()
    admin = psycopg2.connect(dbname="postgres", **base)
    admin.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    try:
        with admin.cursor() as cur:
            cur.execute(f'DROP DATABASE IF EXISTS "{RLS_DB_NAME}"')
            cur.execute(f'CREATE DATABASE "{RLS_DB_NAME}"')

        migrated_url = (
            f"postgresql+asyncpg://{base['user']}:{base['password']}@{base['host']}:{base['port']}/{RLS_DB_NAME}"
        )
        env = os.environ.copy()
        env["DATABASE_URL"] = migrated_url
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND_DIR,
            env=env,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"alembic upgrade failed (exit {result.returncode})\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
            )
        yield {**base, "dbname": RLS_DB_NAME}
    finally:
        with admin.cursor() as cur:
            cur.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()",
                (RLS_DB_NAME,),
            )
            cur.execute(f'DROP DATABASE IF EXISTS "{RLS_DB_NAME}"')
        admin.close()


def _query(dsn: dict[str, str], sql: str) -> list[tuple]:
    conn = psycopg2.connect(**dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            return cur.fetchall()
    finally:
        conn.close()


def _tenant_scoped_tables(dsn: dict[str, str]) -> set[str]:
    # Only base tables — matviews can have a `tenant_id` column for
    # application-level filtering but PostgreSQL doesn't support RLS on
    # matviews, so they shouldn't be treated as RLS-required here.
    return {
        row[0]
        for row in _query(
            dsn,
            "SELECT c.table_name FROM information_schema.columns c "
            "JOIN information_schema.tables t "
            "  ON c.table_schema = t.table_schema AND c.table_name = t.table_name "
            "WHERE c.table_schema = 'public' "
            "  AND c.column_name = 'tenant_id' "
            "  AND t.table_type = 'BASE TABLE'",
        )
    }


def test_no_new_tenant_scoped_table_skips_rls(migrated_db_dsn: dict[str, str]) -> None:
    tenant_scoped = _tenant_scoped_tables(migrated_db_dsn)
    assert tenant_scoped, "Expected at least one tenant-scoped table"

    rls_enabled = {
        row[0]
        for row in _query(
            migrated_db_dsn,
            "SELECT c.relname FROM pg_class c "
            "JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true",
        )
    }

    current_gap = tenant_scoped - rls_enabled
    new_offenders = sorted(current_gap - KNOWN_RLS_GAPS_ENABLE)
    assert not new_offenders, (
        "NEW tables have a `tenant_id` column but RLS is not enabled. Add "
        "`op.execute('ALTER TABLE ... ENABLE ROW LEVEL SECURITY')` in your "
        f"migration: {new_offenders}"
    )
    stale_baseline = sorted(KNOWN_RLS_GAPS_ENABLE - current_gap)
    assert not stale_baseline, (
        "These tables are in KNOWN_RLS_GAPS_ENABLE but now have RLS enabled "
        f"— remove them from the baseline: {stale_baseline}"
    )


def test_no_new_tenant_scoped_table_skips_rls_policy(migrated_db_dsn: dict[str, str]) -> None:
    tenant_scoped = _tenant_scoped_tables(migrated_db_dsn)
    tables_with_policy = {
        row[0]
        for row in _query(
            migrated_db_dsn,
            "SELECT tablename FROM pg_policies WHERE schemaname = 'public'",
        )
    }

    current_gap = tenant_scoped - tables_with_policy
    new_offenders = sorted(current_gap - KNOWN_RLS_GAPS_POLICY)
    assert not new_offenders, (
        "NEW tables have a `tenant_id` column but no RLS policy. Add a "
        "`CREATE POLICY tenant_isolation ON ... USING (tenant_id = "
        "current_setting('app.current_tenant_id', true)::uuid)` in your "
        f"migration: {new_offenders}"
    )
    stale_baseline = sorted(KNOWN_RLS_GAPS_POLICY - current_gap)
    assert not stale_baseline, (
        "These tables are in KNOWN_RLS_GAPS_POLICY but now have a policy — "
        f"remove them from the baseline: {stale_baseline}"
    )
