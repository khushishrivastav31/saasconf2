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
- **In progress — pending commit approval**: Conference-side Portal Account panel (follow-up to Phases 2–6 of the unified customer architecture).
  - Phases 2–6 DONE and pushed to `origin/main` (Phase 5 = `7dda83c`, Phase 6 = `7636315`). `portal_user_history` writes removed; `customer_events` is the single timeline source.
  - **This change** — extend the 5-button "Portal Account" admin panel (Toggle Access / Resend Invite / Reset Password / Impersonate / Merge) from My Company → Users → Detail to the CFP Applicant edit form under Conferences → Users.
    - Backend: added `portal_user_id: UUID | None` to `ApplicantResponse` (`backend/app/schemas/cfp_applicants.py`); populated in all 5 `ApplicantResponse(...)` constructors across `cfp/applicants.py` and `cfp/shared.py`.
    - Frontend: added `portal_user_id: string \| null` to `Applicant` type (`frontend/src/types/cfp.ts`).
    - New reusable components:
      - `frontend/src/components/PortalAccountActions.tsx` — 5 action buttons (all `type="button"` — safe to embed in a form) + Merge dialog state.
      - `frontend/src/components/PortalAccountCard.tsx` — wraps Actions with a status row (Status / Password / Email verified / Last login / Created); fetches detail via `GET /portal-users/:id`.
    - `MergeDialog.tsx` rewritten to drop the `items` prop and look up the source user via `GET /portal-users?search=<email>&per_page=5` — works in any context, not just the list view.
    - `UserDetailPanel.tsx` refactored: drops ~100 lines of duplicated mutation hooks, now uses `<PortalAccountActions>`; `items` prop removed from both panel and `UsersTab/index.tsx` caller.
    - `ApplicantForm.tsx` — `<PortalAccountCard portalUserId={applicant.portal_user_id} />` rendered at the top of the form when the applicant has a linked portal user.
    - Handbook updated: `frontend/src/pages/Handbook/sections/people.tsx` CFP Portal Users section notes the Portal Account card is also available on the Applicant form.
    - **New tests (all passing)**:
      - Backend: `TestApplicantResponsePortalUserId` class appended to `backend/tests/test_cfp_admin_deep.py` — 3 tests covering list (linked/unlinked) + update returning `portal_user_id`.
      - Frontend vitest: `frontend/src/components/__tests__/PortalAccountCard.test.tsx` (3 tests) + `frontend/src/components/__tests__/MergeDialog.test.tsx` (3 tests, API-lookup path).
      - E2E: `frontend/e2e/conference-cfp-applicant-account.spec.ts` — opens a CFP applicant, asserts the 5 Portal Account buttons when linked, and checks the Merge dialog does not submit the underlying form. Filename deliberately avoids "portal" so it binds to the `admin-tests` Playwright project (verified via `playwright test --list`).
    - **Incidental infra fixes in `backend/tests/conftest.py`** (silences noise only — no behaviour change): (1) switched `Base.metadata.sorted_tables` → `Base.metadata.tables.values()` at both cleanup sites to silence SAWarning about tenants/users FK cycle (CASCADE makes sort order irrelevant); (2) moved `_mock_resend_client` fixture below the app imports to clear 9 pre-existing E402 errors.
- **Verification**: `tsc --noEmit` clean; eslint clean on touched files (only pre-existing `ApplicantForm.tsx:max-lines` warning); `mypy app/` clean (675 files); `ruff check`/`format --check` clean on all touched backend files; `vitest` on 3 test files = 11/11; backend `pytest tests/test_cfp_admin_deep.py tests/test_portal_users_admin.py tests/test_customer_event_service.py tests/test_customer_events.py` = 94/94.
- **Status**: uncommitted — see `git status` — **ask user before committing**.
- **Follow-ups on the plan**: migration 206 dropping `portal_user_history` (one release later); messaging + CFP writer wire-up (deferred).
