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

## GitHub Workflow (solo-dev: one approval, auto-merge on green)

**Never commit or push to `main` directly.** All changes route through a topic branch + PR, but the PR auto-merges when CI passes so the user doesn't click through the GitHub UI.

1. **Silent branch creation** — on the FIRST `Edit`/`Write` of a session when the current branch is `main`, run `git checkout -b <type>/<short-kebab-topic>` without asking (branch creation is free, reversible, and invisible). `<type>` matches the coming commit prefix (`feat/`, `fix/`, `refactor/`, `chore/`, `docs/`). Mention the branch name you picked so the user can course-correct.
2. **Develop + verify on branch** — full mypy + ruff + pytest + tsc + eslint + vitest sweep (per the Development Workflow section above).
3. **Single "ship it" approval** — when the sweep is green, present the proposed commit message + scope + PR title and ask once. On approval, execute atomically: `git add <files>` → `git commit` → `git push -u origin <branch>` → `gh pr create` → `gh pr merge --auto --squash`. Return the PR URL. One approval gate, not three.
4. **CI gates the merge** — GitHub auto-merges only when CI is green. Red CI leaves the PR open; surface the failure.
5. **Never merge manually** — don't run `gh pr merge` without `--auto`. CI must gate.

Escape hatches (still ask first):
- **"commit only"** — commit + push, open PR, but **no** `--auto` flag. PR stays open for manual merge.
- **"push to main — trivial"** — single-line doc fixes may go straight to `main`. User must say this literal phrase.

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

On branch `feat/pii-phase-3-accessor-swap` — PII Phase 3+5 ready to ship (2026-04-21).

**In flight**
- **PII Phase 3 + 5 (single PR)**: migration 209 drops plaintext `email`/`phone` columns from `training_attendees` + `cfp_applicants`; swaps `(tenant_id, email)` UNIQUE → `(tenant_id, email_hash)` on `training_attendees`. Model columns replaced with `@property email` / `@property phone` accessors reading via `read_pii()` and writing `*_encrypted` + `*_hash` companions. Admin email search switched to exact-match on `email_hash` when query contains `@` (mirrors `portal_users/listing.py` precedent). Full sweep green: mypy 0, ruff 0, pytest 3029 passed / 56 skipped, frontend tsc 0, eslint 0 errors, vitest 1900 passed. Ready to commit + open PR.

**Recently shipped (April 2026)**
- **Arg-type mypy epic (PRs #85–#96)**: 12 PRs cleared 32 `[arg-type]` errors on `app.api.v1.*` and removed the blanket `disable_error_code = ["arg-type"]` override from `pyproject.toml`. Full unsuppressed `mypy app/` = clean.
- **Migration 208 — drop `portal_user_history`** (PR #71, `94756e2`): phase-7 follow-up of the unified customer architecture. `customer_events` is now the single timeline source.
- **PII Phase 2.5 — dual-write encrypted companions** (PR #69, `92cfcbd`): `@validates` on email/phone populated `*_encrypted` alongside `*_hash`. Backfill hook auto-ran on deploy (`8f6fd37`). Phase-3 PR removes both the validators and the backfill hook.
- **Conference-side customer events** (`55e72ec`): CFP paper + registration lifecycle events; `CustomerTimelineCard` on CFP Applicant form.

**Pending follow-ups (forward-looking, not in flight)**
- **Conference customer events staging backfill**: `cd backend && venv/bin/python -m scripts.backfill_conference_customer_events` — one-time run on staging post-deploy.
- **Messaging writer wire-up**: deferred — schema supports `domain="messaging"` but no writer exists.
