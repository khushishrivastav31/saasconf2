# 0001. Row-Level Security for multi-tenancy

- **Status:** Accepted
- **Date:** 2026-04-17
- **Deciders:** @josediaz
- **Tags:** security, database, multi-tenancy

## Context

SaaSConf is a multi-tenant SaaS. Every business entity (conferences, users, invoices, trainings, …) belongs to one tenant; cross-tenant access is a SEV-1 security bug. There are three well-known isolation strategies for a shared-DB SaaS:

1. **Schema-per-tenant** — one Postgres schema per tenant, dynamic search_path.
2. **Database-per-tenant** — fully separate DB per tenant.
3. **Row-level isolation** — single shared schema, `tenant_id` column on every table, a filter enforced per query.

Constraints at decision time:
- Small team (1 engineer), no capacity to operate N databases or orchestrate N migrations per release.
- Analytics and admin flows need cross-tenant reads (super-admin role).
- Postgres is the only supported database; no plan to support others.
- Performance matters — see `CLAUDE.md` — so any isolation layer must be index-friendly.

## Decision

Use **PostgreSQL Row-Level Security (RLS)** as the enforcement layer. Every tenant-scoped table carries `tenant_id UUID NOT NULL` and has a policy of the form:

```sql
CREATE POLICY tenant_isolation_<table> ON <table>
USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid
       OR current_setting('app.is_super_admin', true) = 'true');
```

The FastAPI dependency chain sets `app.current_tenant_id` (and `app.is_super_admin` for the super-admin role) on the session at the start of every request. Application-level `WHERE tenant_id = ?` is still written for performance + clarity, but RLS is the backstop — if the `WHERE` is ever missing, the data is still isolated.

## Consequences

- **Positive:**
  - One shared schema, one migration per release — operationally cheap.
  - Cross-tenant leak bugs become arithmetically harder: the DB itself refuses to return other tenants' rows, regardless of application mistakes.
  - Super-admin bypass is explicit and auditable via the `app.is_super_admin` setting.
  - Automated CI check verifies every tenant-scoped table has RLS + a policy (`backend/tests/test_rls_coverage.py`).
- **Negative:**
  - Raw SQL and one-off maintenance scripts must remember to set `app.current_tenant_id` or explicitly run as super-admin.
  - Postgres planner sometimes chooses worse plans with RLS active — occasionally need to hint or add the `tenant_id` filter application-side anyway.
  - Migrations that do bulk DDL or cross-tenant backfills must be written against this model (bypass via super-admin session setting, not by disabling RLS).
- **Neutral / note:**
  - Materialized views are **not** covered by RLS (Postgres limitation). `tenant_id` lives as the first column and the application must filter explicitly — see `backend/app/db/migrations/versions/196_dashboard_matviews.py`.
  - A separate runtime role (not the table owner) is required so `FORCE ROW LEVEL SECURITY` is not strictly needed; keep this invariant when provisioning new environments.

## Alternatives considered

- **Schema-per-tenant:** operationally expensive (N migrations, N connection pools, or schema-switching gymnastics). Rejected on team-size grounds.
- **DB-per-tenant:** same as above, plus cross-tenant analytics becomes a data pipeline problem. Rejected.
- **Application-layer-only filtering:** every missed `WHERE` is a breach. Rejected — the blast radius of a single buggy endpoint is too large for a product storing PII.

## References

- `backend/app/db/session.py` — session setup that injects `app.current_tenant_id`.
- `backend/tests/test_rls_coverage.py` — CI check enforcing RLS on every tenant-scoped table.
- `docs/runbooks/rls-policy-verification.md` — manual audit procedure.
- `docs/database.md` — schema and RLS patterns.
