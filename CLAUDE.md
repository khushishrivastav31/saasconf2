# SaaSConf Project Notes

## What This Is

SaaSConf is a **multi-tenant SaaS platform** for conference and training management. Each tenant manages conferences (CFPs, registrations, sponsors, programs) and trainings (program years, placements, offers, invoices, attendees, parking lot, registration portal) — isolated via PostgreSQL Row-Level Security (RLS). **Performance is essential**.

## Development Workflow

**ALWAYS follow this process in order — no skipping:**

1. **Plan First** — Use plan mode for non-trivial features. Get user approval before implementing.
2. **Develop + Write Tests** — Backend: pytest in `backend/tests/`. Frontend: vitest in `__tests__/` dirs.
3. **Run Feature Tests** — `cd backend && venv/bin/python -m pytest tests/test_<feature>.py -v`. Fix failures before proceeding.
4. **Run mypy** — `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`. **MANDATORY — CI rejects type errors.**
5. **Run Ruff** — `cd backend && ruff check app/ && ruff format --check app/`. **MANDATORY — CI rejects unformatted code.**
6. **Run Frontend checks** — `cd frontend && npx tsc --noEmit && npx eslint src/`. **MANDATORY.**
7. **Run Complete Test Suite** — `cd backend && venv/bin/python -m pytest tests/ -v` + `cd frontend && npm run test`. Fix ALL failures.
8. **Update In-App Handbook** — Update `frontend/src/pages/Handbook/handbookSections.tsx` for any UI/behaviour changes visible to users.
9. **Ask Before Commit** — Do NOT automatically commit. User approval required.
10. **Commit + Push** — Conventional commits (`feat:`, `fix:`, `refactor:`). Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>. Push to main triggers staging deploy.

## Architecture
- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL (port 8000)
- **Frontend**: React + TypeScript + TanStack Query + Tailwind CSS (port 3000)
- **Migrations**: Alembic (sequential: `001_`, `002_`, etc.) — commit migration files alongside code changes
- **Multi-tenancy**: Shared DB, shared schema, RLS isolation (`tenant_id` on every table)
- **Async throughout**: `AsyncSession`, `asyncio.to_thread()` for blocking I/O, async generators for streaming

## Performance Rules

### Backend
- **No N+1 queries** — use `joinedload()`, `selectinload()`, or `batch_get_attachment_urls()`
- **Paginate list endpoints** — `skip`/`limit` with defaults (100) and max (500)
- **Async I/O** — never block the event loop; wrap with `asyncio.to_thread()` if needed
- **Stream large exports** — `StreamingResponse` in 1,000-row batches; cap at 50k rows
- **Index new columns** in WHERE/JOIN/ORDER BY — especially `tenant_id`, `conference_id`, `status`, FKs

### Frontend
- **`React.memo`** on list-rendered components
- **`useMemo`/`useCallback`** for expensive computations and stable references
- **Appropriate `staleTime`** — `0` for fresh data, longer for stable data
- **Lazy load routes** — `React.lazy()` with code splitting
- **Avoid re-renders** — don't create objects/arrays inline in render

## Dark Mode Rules
- **Class-based** — `.dark` class on `<html>`, managed by ThemeContext
- **Color mapping**: `bg-white`→`dark:bg-gray-800`, `bg-gray-50`→`dark:bg-gray-900`, `bg-gray-100`→`dark:bg-gray-800`, `text-gray-900`→`dark:text-gray-100`, `text-gray-700`→`dark:text-gray-300`, `text-gray-600`→`dark:text-gray-300` (NOT gray-400), `text-gray-500`→`dark:text-gray-400`, `border-gray-200`→`dark:border-gray-700`, `border-gray-300`→`dark:border-gray-600`, `hover:bg-gray-50`→`dark:hover:bg-gray-700`
- **Form inputs**: `dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100`
- **Semantic colors**: `/30` opacity in dark: `bg-red-50`→`dark:bg-red-900/30`
- **New components must include `dark:` variants**

## Responsive Design (Portal)
- Portal = mobile-friendly. Admin = desktop-first.
- Breakpoints: `sm:` (640px) for stacking, `lg:` (1024px) for sidebar. Skip `md:` unless needed.
- Touch targets: `min-h-[44px]`. Always `flex-wrap` on button groups. Avoid fixed widths in portal.

## Key Conventions
- **Pydantic v2** — `model_config = ConfigDict(from_attributes=True)`. No legacy `class Config:`.
- **Security essentials** — See `.claude/docs/security.md` for full OWASP guidelines. Key rules:
  - SQLAlchemy ORM or parameterized queries only (no f-strings in SQL)
  - Sanitize HTML: backend `sanitize_html()` (nh3) + frontend `sanitizeHtml()` (DOMPurify)
  - Protect endpoints: `CurrentUserDep`, `TenantAdminDep`, `SuperAdminDep`, or `require_module()`
  - New tables: `tenant_id` FK + RLS policy
  - File uploads: `validate_upload()` from `app/core/file_validation.py`
- **Validation** — Use `validators.ts` / `validators.py` functions. Never write ad-hoc regex.
- **Country fields** — Always `<select>` dropdown with `COUNTRY_OPTIONS`. Store ISO codes.
- **VAT fields** — Always use `<VatNumberInput>` component.

## Extended Documentation

Detailed docs are in `.claude/docs/` — read on-demand when working on specific areas:
- **`modules.md`** — Registration, Screen Overlays, Booking, Volunteers, Alumni, Deadlines, Sponsor Contracts
- **`invoices.md`** — Invoice PDF generation, number generation, settings, frontend
- **`security.md`** — Full OWASP guidelines, field validation patterns, auth/authz rules
- **`devops.md`** — CI/CD, Docker, Nginx, testing config, email, rate limiting, CSV exports
- **`auth-flows.md`** — User invite flow, admin password reset
- **`refactoring.md`** — Refactoring guidelines, improvement progress, hook extraction patterns
- **`trainings.md`** — Training module architecture, file structure, invoice/offer/attendee flows

## Session Continuity

**After every response**, keep this section updated with current work state.

### Current Work State
- **Last completed** (2026-04-18, pushed): **Phase H Step 37 phase (f.2) — drop plaintext PII columns**. Migration 199 drops 13 plaintext columns (email/phone/VAT) across 7 tables. All 6 PII-owning models (User, PortalUser, Invoice, BillingProfile, Trainer, Customer) replace the Mapped plaintext column with `@property`/setter that decrypts the `*_encrypted` column on read and writes both `*_encrypted` + `*_hash` on write.
- **In progress — pending commit approval**: **GDPR Art. 15 / 17 Phase 1 plumbing** (separate feature from Step 37 PII encryption). Three new migrations: 200 adds `*_hash` columns + pgcrypto backfill + indexes across 9 subject-identifying tables (registrations, cfp_applicants, training_attendees, training_registrations, training_registration_attendees, offer_attendees, alumni, email_logs, applicant_activity_logs); 201 creates `privacy_requests` table with RLS + GIN index + Fernet-encrypted `subject_emails`; 202 adds `subject_email_hash` indexed column to `audit_logs`. 9 models gained `@validates` hooks that auto-populate the companion hash column on assignment. New `PrivacyRequest` model/schemas with `subject_emails` setter/getter that normalizes + encrypts + hash-mirrors. `BaseService.create_audit_log()` accepts `subject_email_hash` kwarg. PII-view audit events wired into registration / invoice / training_attendee detail opens. `scripts/export_subject_data.py` CLI produces ZIP (manifest.json + data/<table>.json + audit_log.json) via 15-entry LOOKUPS list. In-app handbooks expanded: both `dsgvoCompliance.tsx` (conferences) and `trainingDsgvoCompliance.tsx` (trainings) now cover controller/processor distinction, HGB §257 / AO §147 retention, per-right UI paths (Art. 15/16/17/20/21), portal self-service (today vs Phase 4). Alembic migrations 200-202 applied on dev DB. 19 new Phase 1 tests (2874 total passing + 56 skipped). mypy clean, ruff clean, frontend tsc + eslint clean, vitest 1817 passing.
- **Next up after commit**: (1) **Deploy phase (f.2) + Phase 1 to staging** — phase 1 migrations (200-202) are additive only, no downtime. (2) **Production PII wiring + backfill + deploy**: prod has the same docker-compose gap as staging did (no `PII_ENCRYPTION_KEY` wired) — see `.claude/plans/smooth-sprouting-perlis.md` for the staging fix template. (3) **Rotate staging `PII_ENCRYPTION_KEY`** — it leaked into a terminal `tail/sed` command earlier. (4) **Phase 2**: admin-side Privacy Requests tab under tenant settings.
- **Status**: Local main ahead of origin/main by 1 commit pending (this GDPR Phase 1 bundle).
