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
- **Last completed** (2026-04-18, committed + pushed): Staging PII key wiring fix (`edff8c7`). Root cause was that `PII_ENCRYPTION_KEY` was present in the VM's `/opt/saasconf/app/deploy/staging/.env` but docker-compose.yml never forwarded it into the backend container's environment block — so every redeploy resurfaced the same boot failure. Three-file fix: `deploy/staging/docker-compose.yml` (2 lines in backend `environment:`), `deploy/staging/.env.example` (8-line documented block), `deploy/staging/README.md` (1 bullet). GHA Staging CI/CD run 24601292482 deployed green (health check ✓); only E2E seed step failed (separate issue, not a boot problem).
- **Prior completed** (2026-04-18, committed `23422d9`): Placement `is_active` toggle + zero-reg rows + trainings nav reshuffle + `RegistrationsTab.tsx` split. New migration 198, new `PATCH .../active` endpoint (refuses deactivation with attendees, 409), portal + offer placement queries filter `is_active=true`. `/trainings/registrations` response reshaped to return `items + offer_attendees + placements + trainer_names`. RegistrationsTab split into `registrationGroups.ts` (types + buildGroups) + `TrainingGroupRow.tsx` (group row) — all three files under 400 LOC. Nav: Offer Management, Customers, Attendees, Parking Lot, Users moved from Setup to Operations.
- **Prior completed** (2026-04-18, committed `af68e61`): Refactor + decouple portal-toggle cascade.
  - `backend/app/api/v1/trainings/attendees.py` → `attendees/` package (core, parking, profile, reassignment, _helpers).
  - `backend/app/api/v1/trainings/user_management.py` → `user_management/` package (core, access, media, _helpers).
  - `frontend/src/pages/Trainings/tabs/ParkingLotTab.tsx` → `ParkingLot/` directory (index orchestrator, ParkingLotRow, ParkingLotReassignModal, types, useParkingLotMutations).
  - `toggle_portal_access` no longer mutates `TrainingAttendee.status`. Effective-status derivation at read time handles stale rows: LEFT JOIN PortalUser, treat parked-with-dead-portal as `inactive` in list/profile/parking-lot filter. New `POST /attendees/{id}/deactivate` + `/reactivate` explicit endpoints. Portal-user toggle refuses deactivation when still attached to an active training (409). Tests reshaped: 45 passed in combined suite.
- **Prior completed**: Phase H **Step 37 phase (e) — read cutover for login + uniqueness** (committed `3eef09a`). Every exact-match email lookup on the 6 PII-owning models goes through `User.email_hash == hash_email(...)`. `config._validate_secrets` refuses to boot staging/production without `PII_ENCRYPTION_KEY`. Dev needs the key + migration 197 + one-time backfill (98 rows). See [backend/docs/runbooks/pii-encryption-key-management.md](backend/docs/runbooks/pii-encryption-key-management.md).
- **In progress**: none.
- **Next up**: Push the two uncommitted local commits (`23422d9`, `af68e61`) — staging will auto-deploy. Then flag to user that `OPS_API_KEY` is missing from staging VM `.env` (cron sidecars currently warn) and that the E2E seed step is failing. After that, Phase (f) — grep display sites that read `*.email`/`*.phone`/`*.vat_number` off the 6 PII-owning models and route through `decrypt_pii(*_encrypted)` with fallback; then migration 199 to drop plaintext columns.
- **Status**: Local main ahead of origin by 2 commits (plus staging PII fix `edff8c7` already pushed). Full backend suite baseline prior to this session: 2841 passed, 56 skipped, 0 failed.
