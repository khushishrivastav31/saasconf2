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
- **Last completed**: Phase H **Step 37 phase (e) — read cutover for login + uniqueness**. Every exact-match email lookup on the 6 PII-owning models now goes through `User.email_hash == hash_email(...)` instead of `func.lower(email) == lowercased`.
  - Sites cut over (10 query sites across 9 files): `auth.py` login + forgot-password; `portal_auth.py` login + forgot-password; `cfp_portal/auth.py` admin-account check; `users.py` create + update uniqueness; `trainings/user_management.py` portal-user lookup; `core/registration_replacement.py` (2 sites); `core/portal_user_service.py`; `core/user_auto_creation.py`; `core/invoice/registration_cancellation.py` (IN-clause); `db/seed.py` super-admin bootstrap.
  - `app/config.py` `_validate_secrets` now refuses to boot if `SENTRY_ENVIRONMENT ∈ {production, staging}` and `PII_ENCRYPTION_KEY` is empty. Dev still boots empty, but phase (e) means dev also needs a key for login to work (see runbook).
  - Dev DB required three things to unblock login: `alembic upgrade head` to get migration 197 (adds `*_encrypted` + `*_hash` columns), a dev Fernet key in `backend/.env`, and a one-time run of `scripts.backfill_pii_encryption` (98 rows populated across 13 columns).
  - Runbook `docs/runbooks/pii-encryption-key-management.md` updated: "Environment rules" now documents the dev setup with exact commands. `.env.example` comment updated to match.
  - mypy `app/` clean (640 files). ruff check + format clean. Frontend `tsc --noEmit` clean, `eslint` 0 errors (105 pre-existing max-lines warnings).
  - No ilike-based search sites were touched — those still read plaintext during phase (e). Phase (f) will either drop them or route through a suffix/prefix hash bucket.
- **In progress**: Step 37 phase (f) — drop plaintext columns (migration 198). Also still open: decrypt-on-read for display paths (most read `User.email` directly — fine during (e), breaks after (f)).
- **Next up**: Phase (f) preparation — grep display sites that read `*.email` / `*.phone` / `*.vat_number` off the 6 PII-owning models and route through `decrypt_pii(*_encrypted)` with fallback. Then write migration 198 to drop plaintext columns.
- **Status**: Phase (e) not yet committed — changes: `backend/app/api/v1/{auth,portal_auth,users,cfp_portal/auth,trainings/user_management}.py`, `backend/app/core/{registration_replacement,portal_user_service,user_auto_creation,invoice/registration_cancellation}.py`, `backend/app/db/seed.py`, `backend/app/config.py`, `backend/.env.example`, `docs/runbooks/pii-encryption-key-management.md`. Phase (d) commit `5bd103b` on main (not pushed). Backend running with phase (e) live + dev `PII_ENCRYPTION_KEY` set (backend/.env only, not committed).
