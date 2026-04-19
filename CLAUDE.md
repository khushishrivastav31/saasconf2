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
- **Last completed** (2026-04-19, pushed): **GDPR Phase 4 — portal self-service export + erasure** (commit pending from prior session recovery; see below). Backend split + allowlist + canary scan + 4 portal endpoints + composite `/portal/me` extension.
- **In progress — pending commit approval (COMMIT 1 of portal unification Phase 2.5)**: **Backend dual-token preparation**. Files:
  - New: `backend/app/core/security/portal_compat.py` — `decode_portal_or_applicant_token()` returns `(token_type, payload)` for either JWT issuer (same secret, differ by `type` claim).
  - New: `backend/app/core/portal_linkage.py` — `ensure_portal_user_for_applicant()` creates/links a portal_user row for an orphan CFP applicant (migration 192 excluded any applicant with empty `password_hash`); idempotent, reuses an existing portal_user under the same email_hash instead of duplicating.
  - Modified: `backend/app/core/applicant_dependencies.py::get_current_applicant` — now accepts both token types. For `portal_access` tokens, resolves CFPApplicant via `portal_user_id == sub`; training-only portal users get 401.
  - Modified: `backend/app/api/v1/cfp_portal/auth.py::login_applicant` — on successful legacy login, invokes `ensure_portal_user_for_applicant` so dormant orphans self-heal on next login.
  - Modified: `backend/app/api/v1/portal_auth.py::get_portal_profile` (`/portal/unified/me`) — now returns the flattened composite profile (pronouns, title, company, bio, social_links, full address, theme_preference, has_*_account, *_id) so the unified frontend has one "who am I" call. Added `PATCH /portal/unified/me` (`PortalMePatch`) for UI-only preference updates — currently just theme_preference, validated as `"light"|"dark"`.
  - Migration `203_portal_user_theme_preference.py`: adds `portal_users.theme_preference VARCHAR(5) NULL`, backfills from linked `cfp_applicants.theme_preference` where the portal_user has none.
  - Model: `PortalUser.theme_preference` added. `lookups.py::PORTAL_EXPORT_FIELDS["portal_users"]` extended with `theme_preference` (the allowlist coverage guard caught this automatically).
  - Script: `backend/scripts/backfill_orphan_portal_users.py` — one-shot CLI (`python -m scripts.backfill_orphan_portal_users`) to heal all orphans in bulk per environment; safe to re-run.
  - Tests: `backend/tests/test_portal_dual_token.py` — 11 new tests across 3 classes (`TestDualTokenAcceptance` ×4: applicant token, portal token, training-only portal_user gets 401, admin token rejected; `TestOrphanAutoHeal` ×4: ensure-new, ensure-dedupe-to-existing, legacy-login-heals, backfill-script-heals; `TestCompositePortalMe` ×3: composite fields, PATCH theme, reject invalid theme).
  - All green: backend mypy clean, ruff clean, **25/25 new+Phase 4 tests pass**, **full backend suite 2921 pass / 56 skip / 0 fail** (after adding `theme_preference` to allowlist).
- **Next after commit**: Commit 2 (frontend unified auth context + API client merge — `ApplicantAuthContext` + `portalApi.ts` + `trainingPortalApi.ts` consolidate into a single `PortalAuthContext` + `portalApi.ts` using `portal_access_token` only). Commit 3 (frontend route unification — canonical `/:tenantSlug/portal/*` + permanent redirects from old paths). Commit 4 (cleanup — delete `pages/TrainingPortal/`, `ApplicantAuthContext.tsx`, `config/portalApi.ts` shim). Commit 5 (test-debt backfill). Then stage-deploy + manual portal dry-run. Plan lives at `.claude/plans/portal-unification-phase-2-5.md`.
- **Status**: `main` clean at origin. Phase 4 bundle + Commit 1 of unification uncommitted — **ask user before committing each**.
