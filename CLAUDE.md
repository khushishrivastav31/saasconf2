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
- **Last completed** (2026-04-19, pushed): **GDPR Phase 3 — erasure execution**. Shared catalogue `backend/app/core/gdpr/lookups.py` with per-table `erasure_default` + `allowed_actions`; `erasure.py` service with `build_preview` + `execute_erasure` (anonymise-first, delete in dependency order). `POST /{id}/preview-erasure` + `POST /{id}/execute-erasure` (5/hour tenant limit, type-to-confirm `ERASE` barrier), invoices locked at skip (HGB §257). Frontend `ExecuteErasureModal.tsx` + handbook flips.
- **In progress — pending commit approval**: **GDPR Phase 4 — portal self-service export + erasure**. Backend: split the export builder into a new module `backend/app/core/gdpr/export.py` with `build_export(mode="admin"|"portal")`; portal mode drives off a strict allowlist (`PORTAL_EXPORT_FIELDS` + `PORTAL_EXPORT_EXCLUDED_COLUMNS` in `lookups.py`) so internal staff notes and payment-processor identifiers never ship. New portal router `backend/app/api/v1/portal/privacy.py` (wired in `portal/router.py`) with 4 endpoints under `/api/v1/portal/me/privacy-requests/*`: `POST` (inline export w/ 7-day download URL, or queued erasure), `GET` (paginated list), `GET /{id}` (detail), `GET /{id}/download` (stream ZIP, 410 after window). Rate-limited `3/day` per IP. `subject_emails` always stamped from the caller's authenticated `PortalUser.email` — never accepted from the client. 3 new audit actions: `PRIVACY_REQUEST_PORTAL_CREATE`, `PRIVACY_REQUEST_PORTAL_EXPORT`, `PRIVACY_REQUEST_PORTAL_DOWNLOAD`. 14 new tests in `tests/test_gdpr_phase4.py` — 3 classes: `TestPortalAllowlistIntegrity` (schema coverage guard: every physical column must be in FIELDS or EXCLUDED, fails CI on drift), `TestPortalExportLeakProofing` (runtime canary byte-scan — seed distinctive strings in staff-only fields, decompress every ZIP member and assert canaries absent), `TestPortalPrivacyEndpoints` (happy path + client cannot forge subject email + cross-caller isolation + audit trail). Frontend: `frontend/src/components/portal/PrivacyMyDataPanel.tsx` — 3-section panel (Download my data, Request deletion, My requests history) using `trainingPortalApi` (unified `portal_access_token`). New route `:tenantSlug/trainings/portal/privacy` + nav link in `PortalLayout.tsx`. New `PrivacyPage.tsx` at `pages/TrainingPortal/PrivacyPage.tsx` combines `PrivacyMyDataPanel` + existing `DataRightsPanel`. Types added in `pages/MyCompany/types.ts` (`PortalPrivacyRequestResponse`, `PortalExportCreateResponse`, etc.), query-key factory `queryKeys.portalPrivacyRequests.{all,list,detail}`. 5 new vitest cases (`components/portal/__tests__/PrivacyMyDataPanel.test.tsx`). Handbook `dsgvoCompliance.tsx` + `trainingDsgvoCompliance.tsx` — "Phase 4 planned" → "Phase 4 — live"; documents the allowlist + coverage guard + canary scan, 3/day rate limit, 7-day download window, and that `subject_emails` is stamped server-side. All checks green: backend mypy + ruff clean, `test_gdpr_phase4.py` 14/14 pass, full backend suite green. Frontend tsc clean, eslint 0 errors (only preexisting max-lines warnings), vitest 1840/1840 pass. No migration needed.
- **Next up after commit**: (1) Deploy Phase 4 to staging and manually dry-run the portal flow: log in as a training-portal user, hit Privacy → Download my data (verify ZIP opens, contains no internal-comment fields), hit Request deletion (verify admin sees the queued request with `portal_user_id` set). (2) **CFP applicant portal parity**: the existing `pages/portal/PrivacyPage.tsx` (applicant-token-based) still only shows `DataRightsPanel` — either mount the same self-serve panel behind applicant auth (requires backend tolerating applicant tokens or linking applicants to portal_users), or add a clear signpost telling applicants to log into the unified portal. (3) Production PII wiring + backfill (fix staging-template docker-compose `PII_ENCRYPTION_KEY` gap) once prod env is cut. (4) Rotate staging `PII_ENCRYPTION_KEY` — it leaked into a terminal `tail/sed` earlier.
- **Status**: `main` is clean at origin; Phase 4 bundle uncommitted and awaiting approval.
