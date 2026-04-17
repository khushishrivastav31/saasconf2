# RLS policy verification

_Last verified: 2026-04-17_
_Status: **active** — RLS is the cornerstone of SaaSConf's tenant isolation. This runbook is the manual fallback / audit tool; the automated check lives in `backend/tests/test_rls_coverage.py`._

## Why this matters

Every tenant-scoped table **must** have:

1. `tenant_id UUID NOT NULL` referencing `tenants.id`.
2. `ROW LEVEL SECURITY ENABLED`.
3. At least one policy filtering on `tenant_id = current_setting('app.current_tenant_id')::uuid`
   (with a bypass for `app.is_super_admin = 'true'`).

Missing any of these = cross-tenant data leak. This is a SEV-1 security bug.

## TL;DR

Run the audit query below on the production DB. Any row in the output is a
bug. Fix before the next release.

## The audit query

```sql
-- Every table with tenant_id that is NOT protected by RLS + a policy.
WITH tenant_tables AS (
  SELECT c.table_name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_name = c.table_name
   AND t.table_schema = c.table_schema
  WHERE c.column_name = 'tenant_id'
    AND c.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
),
rls_status AS (
  SELECT c.relname AS table_name,
         c.relrowsecurity AS rls_enabled,
         COUNT(p.polname) AS policy_count
  FROM pg_class c
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind = 'r'
  GROUP BY c.relname, c.relrowsecurity
)
SELECT t.table_name,
       COALESCE(r.rls_enabled, false) AS rls_enabled,
       COALESCE(r.policy_count, 0)    AS policy_count
FROM tenant_tables t
LEFT JOIN rls_status r USING (table_name)
WHERE COALESCE(r.rls_enabled, false) = false
   OR COALESCE(r.policy_count, 0) = 0
ORDER BY t.table_name;
```

**Expected result:** zero rows.

## When to run it

- **Automated:** `backend/tests/test_rls_coverage.py` runs this in CI on
  every migration. CI fails loud if the result is non-empty.
- **Manually in production** after any deploy that adds a migration
  touching table schemas (audit step).
- **Quarterly** against production as a scheduled audit, even when the
  automated test is green (catches drift from hand-run DDL).

## How to run it

### Against production

```bash
ssh prod-host
cd /opt/saasconf/app/deploy/production
docker compose exec postgres psql -U saasconf -d saasconf -f - <<'SQL'
WITH tenant_tables AS (
  SELECT c.table_name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_name = c.table_name
   AND t.table_schema = c.table_schema
  WHERE c.column_name = 'tenant_id'
    AND c.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
),
rls_status AS (
  SELECT c.relname AS table_name,
         c.relrowsecurity AS rls_enabled,
         COUNT(p.polname) AS policy_count
  FROM pg_class c
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind = 'r'
  GROUP BY c.relname, c.relrowsecurity
)
SELECT t.table_name,
       COALESCE(r.rls_enabled, false) AS rls_enabled,
       COALESCE(r.policy_count, 0)    AS policy_count
FROM tenant_tables t
LEFT JOIN rls_status r USING (table_name)
WHERE COALESCE(r.rls_enabled, false) = false
   OR COALESCE(r.policy_count, 0) = 0
ORDER BY t.table_name;
SQL
```

### Against CI's Postgres

The test `backend/tests/test_rls_coverage.py` runs this against the CI
DB on every migration. If CI fails on RLS coverage, the failure message
names the table.

## What to do if a table is missing RLS

### 1. Confirm the table is actually tenant-scoped

If it's a global table (e.g. `modules`, `countries`) that happens to
have a `tenant_id` column for some other reason, rename the column or
special-case it in the audit. Global config should not have `tenant_id`.

### 2. Write a migration to enable RLS + add a policy

Template (match the existing pattern in e.g. `backend/app/db/migrations/versions/195_exchange_rate.py`):

```python
def upgrade() -> None:
    op.execute("ALTER TABLE <table> ENABLE ROW LEVEL SECURITY")
    op.execute(
        """CREATE POLICY tenant_isolation_<table> ON <table>
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
               OR current_setting('app.is_super_admin', true) = 'true')"""
    )

def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_<table> ON <table>")
    op.execute("ALTER TABLE <table> DISABLE ROW LEVEL SECURITY")
```

### 3. Verify the policy actually filters

RLS policies silently allow everything if the `USING` clause evaluates to
true. Test with a manually-set session:

```sql
-- As a super-user
SET app.current_tenant_id = '<tenant-A-uuid>';
SELECT count(*) FROM <table>;
-- Should only count tenant A's rows.

SET app.current_tenant_id = '<tenant-B-uuid>';
SELECT count(*) FROM <table>;
-- Should only count tenant B's rows.

-- Verify bypass works
SET app.is_super_admin = 'true';
SELECT count(*) FROM <table>;
-- Returns everything.
```

### 4. Re-run the audit

Confirm the offending table is no longer in the result.

## Extra checks worth running

### Tables where RLS is enabled but `FORCE` is not set

Postgres allows the table owner to bypass RLS unless `FORCE ROW LEVEL SECURITY`
is on. For a belt-and-suspenders setup:

```sql
SELECT c.relname
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND c.relforcerowsecurity = false;
```

Current stance: we use a dedicated non-superuser role at runtime, so `FORCE`
is not strictly required. But adding it is cheap insurance.

### Policies that allow `USING (true)`

A policy with `USING (true)` allows everything and defeats RLS. Find them:

```sql
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE qual = 'true' OR qual ILIKE '%true%' AND qual NOT LIKE '%tenant_id%';
```

## Anti-patterns — don't do these

- **Don't add a new table with `tenant_id` without RLS + policy.** CI
  catches this — do not disable the check to get your PR green.
- **Don't rely on application-layer `WHERE tenant_id = ...` alone.** One
  missing clause anywhere in the codebase = cross-tenant leak. RLS is
  the enforcement layer; app-layer filtering is an optimization.
- **Don't set `app.current_tenant_id` inside a transaction and assume it
  persists.** Every connection from the pool may land in a different
  state — the FastAPI dependency chain sets it per request.
- **Don't drop RLS "temporarily" for a migration.** Either rewrite the
  migration to work within RLS (use a super-admin session for bulk DDL),
  or bypass at the session level (`SET ROLE`) — never globally disable.
- **Don't add new global tables with `tenant_id`.** If a table is global,
  it shouldn't have the column. The audit query treats `tenant_id` as
  the signal for "must have RLS".
