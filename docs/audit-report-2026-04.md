# SaaSConf — Professional Architecture & Quality Audit

**Date:** 2026-04-17
**Scope:** Full-stack audit — backend, frontend, data model, DevOps, CI/CD, security
**Verdict:** **Production-ready, 8.2/10.** Mature codebase with enterprise-grade foundations. Main gaps are in *scale hygiene* (god-files, form patterns, shared UI primitives), *operational rigor* (production pipeline, runbooks, SAST), and a small set of *security hardening* items.

---

## 1. Executive Summary

SaaSConf is a serious multi-tenant SaaS platform with ~104k LOC backend, ~612 TS/TSX files frontend, 62 data models, 195 migrations, and a CI/CD pipeline that gates on tests, lint, type-check, and security scans. Critical engineering fundamentals are **already right**:

- **Tenant isolation via PostgreSQL RLS** on every table (`tenant_id` FK + policy, super-admin bypass via session var).
- **Async SQLAlchemy** end-to-end with disciplined eager loading (`selectinload`), no N+1 hotspots found.
- **Argon2id password hashing**, Redis-backed JWT blacklist + rate limiter, magic-byte file validation, `nh3` + DOMPurify defense-in-depth sanitization.
- **Strict TypeScript** (zero `@ts-ignore`, one `any` in the entire codebase), centralized query keys, comprehensive `React.lazy` code-splitting.
- **Structured JSON logging**, Sentry + Prometheus, correlation IDs, liveness + readiness probes.
- **195 Alembic migrations** with downgrades, no reckless `NOT NULL` additions on large tables.

The gap between the current state and "professional, maintainable, high-quality environment" is not about rewriting — it's about **compounding discipline**: taming the growing tail of 1000+ line files, extracting shared primitives (DataTable, form fields, DetailPanel), tightening the release & incident-response loop, and closing a handful of specific security/ops items.

---

## 2. Scorecard

| Domain                         | Score | Status        |
|--------------------------------|:-----:|---------------|
| Backend architecture           | 9/10  | Strong        |
| Auth & access control          | 9/10  | Excellent     |
| Database & multi-tenancy       | 9/10  | Strong        |
| Migrations                     | 8/10  | Good          |
| Input validation & schemas     | 9/10  | Strict        |
| Frontend architecture          | 7/10  | Good, scaling |
| Frontend type safety           | 9/10  | Excellent     |
| Testing (BE integration)       | 8/10  | Good          |
| Testing (FE coverage 61%)      | 6/10  | Adequate      |
| CI/CD pipelines                | 9/10  | Comprehensive |
| Docker / deployment            | 8/10  | Good          |
| Nginx / edge security          | 9/10  | Hardened      |
| Monitoring / observability     | 7/10  | Present, gaps |
| Security posture (OWASP)       | 8/10  | Solid         |
| Documentation & runbooks       | 7/10  | Good, gaps    |
| Release management             | 7/10  | Gaps          |
| **Overall**                    |**8.2**|**Production-ready with hardening**|

---

## 3. Strengths Worth Preserving

These are patterns that new contributors should *not* break:

- **Dependency-injected auth** — `CurrentUserDep`, `TenantAdminDep`, `SuperAdminDep`, `require_module()` compose cleanly; RLS context is set inside `get_current_user()` so every request is tenant-scoped by construction.
- **Centralized query keys** — [frontend/src/config/queryKeys.ts](frontend/src/config/queryKeys.ts) (336 lines) with typed factory functions. 479 `invalidateQueries` calls are almost all targeted — rare broad invalidations.
- **Redis-backed rate limiter** (critical for multi-worker; commit `92c5a6d` moved it there).
- **Monetary fields are `Numeric(12, 2)` + Python `Decimal`** — zero `Float` in financial code.
- **Magic-byte file validation** ([backend/app/core/file_validation.py](backend/app/core/file_validation.py)) with per-entity MIME whitelists, filename sanitization, EXIF stripping.
- **Immutable audit log** ([backend/app/models/audit.py](backend/app/models/audit.py)) with JSONB details + indexed correlation fields.
- **Playwright E2E + Vitest units** — 49 e2e specs, 113 unit test files, real-Postgres backend tests with per-test `TRUNCATE CASCADE`.
- **Structured logging with PII redaction** ([backend/app/core/logging.py](backend/app/core/logging.py)) via `SensitiveFieldFilter`.

---

## 4. Findings — Backend

### 4.1 God-files creeping in

Several endpoint files are approaching maintainability limits:

| File                                                      | LOC  |
|-----------------------------------------------------------|------|
| [backend/app/api/v1/volunteer_tasks.py](backend/app/api/v1/volunteer_tasks.py)                    | 1034 |
| [backend/app/core/default_settings.py](backend/app/core/default_settings.py)                      | 1016 |
| [backend/app/api/v1/speaker_expenses.py](backend/app/api/v1/speaker_expenses.py)                  | 982  |
| [backend/app/api/v1/cfp_portal/registration.py](backend/app/api/v1/cfp_portal/registration.py)    | 975  |
| [backend/app/api/v1/messaging/threads.py](backend/app/api/v1/messaging/threads.py)                | 972  |
| [backend/app/api/v1/portal/training_portal.py](backend/app/api/v1/portal/training_portal.py)      | 957  |

**Recommendation:** Extract a `services/` layer for business logic (keep routers thin: validate → call service → return schema). `app/core/` has 73 files and is becoming a catch-all — subpackage it (e.g., `core/invoice/`, `core/email/`, `core/pdf/`).

### 4.2 Rate limiting is auth-only

`slowapi` limits cover `/login` (30/min), MFA (5/min), refresh (10/min), portal checkout (10/min). Non-auth list/detail endpoints have **no per-tenant or per-user limit** — a compromised tenant could cause runaway DB load.

**Recommendation:** Add a global default limit (e.g., 300/min/user) with per-endpoint overrides. Consider per-tenant limits for expensive endpoints (exports, PDF generation).

### 4.3 `/metrics` endpoint is public

`prometheus_fastapi_instrumentator` exposes `/metrics` unauthenticated in `main.py:109`. Internal metrics should not be scrapeable by the public.

**Recommendation:** Add Nginx IP allowlist or basic-auth for `/metrics`.

### 4.4 Coverage reporting is implicit

Tests run but there's no `pytest --cov` gate visible in CI beyond `--cov-fail-under=50`. 50% is low for a financial multi-tenant SaaS.

**Recommendation:** Raise backend coverage floor to 70%. Generate HTML coverage as a CI artifact for PR review.

### 4.5 Small polish items

- `/app/api/v1/auth.py` loads tenant modules via multiple `.all()` calls — batchable.
- No APM beyond Sentry traces (query-level timing not visible).
- `DATABASE_SSL_REQUIRED` not enforced — config-driven, make it required in prod.

---

## 5. Findings — Frontend

### 5.1 Eight god-components over 1000 lines

| File                                                                                                             | LOC  |
|------------------------------------------------------------------------------------------------------------------|------|
| [frontend/src/pages/ConferenceDetail/tabs/InvoicesTab/index.tsx](frontend/src/pages/ConferenceDetail/tabs/InvoicesTab/index.tsx) | 1208 |
| [frontend/src/components/InvoiceDetailPanel/index.tsx](frontend/src/components/InvoiceDetailPanel/index.tsx)                     | 1128 |
| [frontend/src/pages/modules/cfp/CFPPapers/PaperForm.tsx](frontend/src/pages/modules/cfp/CFPPapers/PaperForm.tsx)                 | 1122 |
| [frontend/src/pages/admin/Tenants/components/CompanyInfoTab.tsx](frontend/src/pages/admin/Tenants/components/CompanyInfoTab.tsx) | 1078 |
| [frontend/src/pages/ConferenceDetail/tabs/SpeakerExpensesTab/index.tsx](frontend/src/pages/ConferenceDetail/tabs/SpeakerExpensesTab/index.tsx) | 1070 |
| [frontend/src/pages/Trainings/tabs/UsersTab/UserDetailPanel.tsx](frontend/src/pages/Trainings/tabs/UsersTab/UserDetailPanel.tsx) | 1060 |
| [frontend/src/pages/Trainings/tabs/CustomerDetailPanel/OffersTab/index.tsx](frontend/src/pages/Trainings/tabs/CustomerDetailPanel/OffersTab/index.tsx) | 1055 |

These are the highest-friction files for change: re-renders are larger, tests are harder, conflicts more frequent. The Trainings module was recently refactored successfully — apply the same discipline here.

**Recommendation:** Split using container/presenter boundary; keep components under ~400 LOC. Extract local hooks for logic that doesn't render.

### 5.2 No shared primitives — patterns are re-invented

- **No `<DataTable>` base** — each table (invoices, registrations, attendees, volunteers, speakers) reimplements sorting, pagination, selection, virtualization.
- **No `<Input>/<Select>/<Checkbox>`** — form fields are inline in every page with ad-hoc dark-mode classes.
- **No `<BaseDetailPanel>`** — Invoice / Registration / User / Customer detail panels each reinvent the 2-column edit UI + validation + mutation pattern.

**Recommendation:** Extract these three primitives as the highest-ROI refactor. Every future page becomes cheaper.

### 5.3 No form library — 1,802 `useState` calls

Large forms (PaperForm 1122 lines, CompanyInfoTab 1078 lines) manage fields with 30+ individual `useState` calls and hand-rolled validation. This is tedious and bug-prone — one forgotten `setState` and a field goes stale.

**Recommendation:** Adopt **React Hook Form + Zod** for any form with 5+ fields. Zod schemas can mirror Pydantic schemas (manually or via codegen), shrinking FE/BE drift.

### 5.4 Virtualization gap

Only [frontend/src/pages/ConferenceDetail/tabs/RegistrationsTab/RegistrationListView.tsx](frontend/src/pages/ConferenceDetail/tabs/RegistrationsTab/RegistrationListView.tsx) uses `@tanstack/react-virtual`. `AttendeesTab` (979 lines) and `VolunteerAssignmentTab` (903 lines) render long lists without virtualization.

**Recommendation:** Audit list components; virtualize any that can render >100 rows.

### 5.5 Accessibility is thin

51 `aria-*`/`role=` usages across 612 files. Dialogs and status badges have semantic attributes; most lists, tables, and action buttons do not.

**Recommendation:** Add `role="table"`, `aria-label` on icon-only buttons, and consistent keyboard navigation. Set eslint-plugin-jsx-a11y to error.

### 5.6 No backend type sharing

Types are hand-rolled (`types/conference.ts`, `types/training.ts`, etc.) — guaranteed to drift from backend Pydantic schemas over time.

**Recommendation:** Generate a TS client from the FastAPI OpenAPI spec (e.g., `openapi-typescript` or `orval`) in CI. Even a read-only generated `api-types.ts` eliminates an entire class of bugs.

### 5.7 Test coverage at 61%

Threshold is 60% statements — meeting the bar but not exceeding it. Worst offenders: `BadgeTemplateEditor` (4%), `CertificationBodyDetailPanel` (0%).

**Recommendation:** Set a staircase: 65% in Q2, 70% by year-end. Prioritize high-impact pages (ConferenceDetail, CFP, Trainings).

---

## 6. Findings — Data Model

### 6.1 RLS coverage is ~95% — worth verifying at 100%

Every tenant-scoped model inspected has `tenant_id` FK. RLS policies are present in migrations 001, 002, 003, 008, 009 and others, but there is **no automated verification** that every tenant-scoped table has an active RLS policy.

**Recommendation:** Add a CI check that queries `pg_policies` after migrations run, asserting every table with a `tenant_id` column has `ENABLE ROW LEVEL SECURITY` and at least one policy. One `CREATE TABLE` without RLS is a tenant-crossing bug waiting to happen.

### 6.2 PII stored in plaintext

Emails, names, phones, VAT numbers, and JSONB `contact_persons` arrays are unencrypted at rest. Access control is via PostgreSQL alone.

**Recommendation:** For GDPR posture, consider column-level encryption (pgcrypto or app-layer with KMS) for high-sensitivity fields: phone, full address, VAT. Document in a data-classification policy.

### 6.3 Multi-currency without FX rate history

`Invoice.currency`, `Training.invoice_currency`, `DiscountCode.currency` exist, but there is **no `ExchangeRate` table** with `effective_date`. If an offer quoted in EUR is paid in USD, reconciliation is manual.

**Recommendation:** Add `ExchangeRate(tenant_id, from_ccy, to_ccy, rate, effective_at)` and attach a frozen rate to each invoice at issue time.

### 6.4 No materialized views / cached aggregates

Dashboards and financial reports likely compute aggregates on every read. As tenant data grows (`Registration` → 100k rows, `AuditLog` → 1M rows, `RegistrationQuestionAnswer` → 1M rows), these queries will slow.

**Recommendation:** Add materialized views for common aggregates (registration counts, invoice totals per conference, revenue per training). Refresh nightly via cron.

### 6.5 No enum CHECK constraints

Enums are Python `StrEnum` + `String(50)` columns. A bad INSERT bypassing the ORM (raw SQL, data import) could store an invalid enum value.

**Recommendation:** Either use PostgreSQL native `ENUM` types or add `CHECK (status IN ('draft', 'open', ...))` constraints in migrations.

### 6.6 Soft-delete pattern is inconsistent

Only `Message` / `MessageThread` use `archived_at`. Everything else cascades. Some entities (Invoice, Registration) arguably need soft-delete for compliance/audit reasons.

**Recommendation:** Decide a policy: either commit to CASCADE + rely on AuditLog for history, or adopt `deleted_at` where business compliance requires it. Don't leave it per-model.

---

## 7. Findings — DevOps, CI/CD, Security

### 7.1 No documented production deployment pipeline

[.github/workflows/staging.yml](.github/workflows/staging.yml) deploys to staging on main push. **Production rollout is not visible** — is it manual, a separate workflow, or from staging images?

**Recommendation:** Document the production deploy process end-to-end. Add a production workflow with: tag-triggered deploy, manual approval, blue-green or canary rollout, documented rollback command.

### 7.2 No SAST

Pipeline runs `pip-audit`, `npm audit`, Trivy, TruffleHog — all dependency/secret scanners. There is **no code-level SAST** (Bandit for Python, Semgrep, CodeQL).

**Recommendation:** Add GitHub CodeQL (free for open-source / GitHub Advanced Security). Low noise, high signal.

### 7.3 No CODEOWNERS

GitHub branch protection may require reviews, but there's no [CODEOWNERS](.github/CODEOWNERS) file routing PRs to the right reviewers.

**Recommendation:** Create `.github/CODEOWNERS` mapping `backend/app/core/invoice_*.py` to the billing owner, `backend/app/api/v1/cfp_portal/` to CFP, etc.

### 7.4 No runbooks or ADRs

`.claude/docs/` is rich, but there are no **Runbooks** (how to restore a backup, rotate JWT secret, respond to Sentry alert) and no **ADRs** (why RLS over discriminator columns, why HS256 over RS256, why Redis for rate limiting).

**Recommendation:** Start `docs/runbooks/` and `docs/adr/` now. First ADR: "Why RLS for multi-tenancy." First runbook: "Restoring from backup."

### 7.5 No release tags

Git history has conventional commits and a CHANGELOG, but **no git tags** marking releases. Rollback is harder without "we are on v0.1.4, roll back to v0.1.3."

**Recommendation:** Tag each release (`v0.X.Y`). Automate with a release-please or semantic-release action.

### 7.6 Backup verification is shallow

`backup.sh` tests `gzip` integrity but does not perform a trial restore. "Backup worked" ≠ "backup is restorable."

**Recommendation:** Quarterly automated restore drill: spin up a throwaway Postgres, `pg_restore` a real backup, run `SELECT 1` on key tables. Failing = page someone.

### 7.7 No per-tenant rate limiting

Current limits are per-IP. A noisy tenant shares a limit with quiet ones behind the same egress IP.

**Recommendation:** Key rate limit by `tenant_id` (or user) once authenticated. Reserve per-IP limiting for pre-auth endpoints.

### 7.8 Smaller items

- `/metrics` public (see §4.3).
- Secret rotation process undocumented (JWT key, Resend, Stripe, OPS_API_KEY).
- CSP allows `blob:` scripts — tighten if web workers are not used.
- No signed container images (Cosign) — future supply-chain hardening.
- Frontend has Sentry but no Web Vitals / RUM.

---

## 8. Prioritized Roadmap

### Phase 1 — Immediate (2 weeks)

| # | Action | Effort | Owner |
|---|--------|:------:|-------|
| 1 | Authenticate `/metrics` (Nginx basic-auth or IP allowlist) | S | Backend |
| 2 | Document production deploy + rollback procedures | S | DevOps |
| 3 | Add CI check: `pg_policies` RLS coverage on every tenant-scoped table | S | Backend |
| 4 | Add `.github/CODEOWNERS` | S | Tech lead |
| 5 | Enforce `DATABASE_SSL_REQUIRED=True` in staging/prod | S | DevOps |
| 6 | Tag current release as `v0.1.0` and document tagging policy | S | Tech lead |
| 7 | Raise login rate limit audit — confirm 30/min is right for prod (was bumped for E2E) | S | Backend |

### Phase 2 — Short-term (1 month)

| # | Action | Effort | Owner |
|---|--------|:------:|-------|
| 8 | Extract shared `<DataTable>`, `<Input>`, `<Select>`, `<BaseDetailPanel>` primitives | L | Frontend |
| 9 | Refactor one 1000+ LOC component as a template (e.g., `InvoicesTab`) | M | Frontend |
| 10 | Generate TypeScript client from OpenAPI spec in CI | M | Full-stack |
| 11 | Add CodeQL to CI | S | DevOps |
| 12 | Add runbooks for: backup restore, secret rotation, incident response | M | Tech lead |
| 13 | Raise BE coverage floor to 70%; FE to 65% | M | All |
| 14 | Add per-tenant rate limits on expensive endpoints (exports, PDF) | M | Backend |
| 15 | Automated backup restore test (quarterly, scripted in CI) | M | DevOps |

### Phase 3 — Medium-term (1-3 months)

| # | Action | Effort | Owner |
|---|--------|:------:|-------|
| 16 | Adopt React Hook Form + Zod on large forms (PaperForm, CompanyInfoTab) | L | Frontend |
| 17 | Refactor remaining 7 god-components | L | Frontend |
| 18 | Add materialized views for dashboard aggregates | M | Backend |
| 19 | Add `ExchangeRate` table + attach rate to invoices at issue | M | Backend |
| 20 | Extract `app/core/` into subpackages (invoice/, email/, pdf/) | L | Backend |
| 21 | Extract services layer; shrink routers to thin controllers | L | Backend |
| 22 | Add jsx-a11y lint rules at error level; audit ARIA coverage | M | Frontend |
| 23 | Sentry alert rules (error spike, 5xx threshold) as code | S | DevOps |
| 24 | ADR process: start `docs/adr/`, document RLS/JWT/Redis decisions | S | Tech lead |

### Phase 4 — Long-term (3-6 months)

| # | Action |
|---|--------|
| 25 | Column-level PII encryption (pgcrypto or app-layer + KMS) |
| 26 | APM integration (Datadog / New Relic) for query-level performance |
| 27 | Web Vitals / RUM on frontend |
| 28 | Signed container images (Cosign) |
| 29 | GDPR endpoints (data export, right to erasure) |
| 30 | SOC 2 Type II readiness (logging, access review, change management) |

---

## 9. Process Recommendations

Engineering excellence is mostly about repeatable habits:

1. **Hard cap on file size.** Add an ESLint rule (`max-lines: 400`) and a pre-commit check on Python files. Don't let new 1000+ line files land.
2. **"One primitive per PR" refactor budget.** Every sprint, extract one shared primitive (Input, DataTable, Modal). In 10 sprints the frontend is transformed.
3. **No new model without an RLS policy.** Add a migration template that includes `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; CREATE POLICY ...` so it's never forgotten.
4. **ADR for every cross-cutting decision.** 10 one-page ADRs (RLS, JWT, Redis, async SQLAlchemy, Pydantic v2, etc.) are worth more than 100 pages of tutorials.
5. **Runbook-or-it-didn't-happen.** Every production capability (backup, restore, rotation, incident) needs a runbook before it's declared done.
6. **Track technical debt explicitly.** A single `TECH_DEBT.md` with a prioritized list beats scattered TODOs.
7. **Quarterly security review.** 1-hour meeting: review Dependabot PRs merged, new CVEs on stack, secrets baseline refresh, access review.

---

## 10. Verdict

**SaaSConf is a well-engineered platform that is already in the top decile of SaaS codebases I would audit.** The foundations — multi-tenancy, async, type safety, CI gates, structured logging — are correct. The issues identified are **normal growing-pains of a scaling codebase**, not architectural defects. Execute Phases 1-2 (about 6 weeks of focused work) and the platform is genuinely professional-grade: easy to maintain, secure by default, high quality by construction.

The single most impactful change is **extracting shared frontend primitives** — it unlocks faster feature work and cheaper bug fixes across every page, compounding over time.

---

*Audit performed with codebase snapshot as of 2026-04-17 main branch.*
