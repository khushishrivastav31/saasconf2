# SaaSConf Project Notes

## What This Is

SaaSConf is a **multi-tenant SaaS platform** for conference management. Each tenant manages conferences, CFPs, registrations, sponsors, and programs — isolated via PostgreSQL Row-Level Security (RLS). **Performance is essential**.

## Development Workflow

**ALWAYS follow this process:**

1. **Plan First** — Use plan mode for non-trivial features. Get user approval before implementing.
2. **Develop + Write Tests** — Backend: pytest in `backend/tests/`. Frontend: vitest in `__tests__/` dirs.
3. **Run Feature Tests** — Backend: `cd backend && venv/bin/python -m pytest tests/test_<feature>.py -v`. Frontend: `cd frontend && npm run test`. Fix failures before proceeding.
4. **Run Type Checks** — Backend: `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`. Frontend: `cd frontend && npx tsc --noEmit`. **MANDATORY before committing** — CI will reject type errors.
5. **Run Linters** — Backend: `cd backend && ruff check app/ && ruff format --check app/`. Frontend: `cd frontend && npx eslint src/`. **Always run before committing** — CI will reject unformatted code.
6. **Update Tenant UI Handbook** — **MANDATORY before committing** to keep documentation current:
   - Review changes and determine if handbook updates are needed
   - Update `docs/tenant-ui-handbook.md` with new features, settings, or workflows
   - Document any changed UI, new fields, or modified behavior
   - Add troubleshooting entries for common issues
   - Update best practices if workflow changes
   - This saves significant rework later and ensures users have current documentation
7. **Run Complete Test Suite** — **MANDATORY before committing** to avoid CI/CD pipeline failures:
   - Backend: `cd backend && venv/bin/python -m pytest tests/ -v` (all tests)
   - Frontend: `cd frontend && npm run test` (all tests)
   - Fix ALL failures before proceeding to commit
8. **Ask Before Commit** — Do NOT automatically commit. User approval required.
9. **Commit + Deploy** — Conventional commits (`feat:`, `fix:`, `refactor:`). Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>. Push to main triggers staging deploy.

## Architecture
- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL (port 8000)
- **Frontend**: React + TypeScript + TanStack Query + Tailwind CSS (port 3000)
- **Migrations**: Alembic (sequential: `001_`, `002_`, etc.)
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
- **Validation** — Use `validators.ts` / `validators.py` functions. Never write ad-hoc regex. See `.claude/docs/security.md` for full field validation rules.
- **Country fields** — Always `<select>` dropdown with `COUNTRY_OPTIONS`. Store ISO codes.
- **VAT fields** — Always use `<VatNumberInput>` component.

## Extended Documentation

Detailed docs are in `.claude/docs/` and `docs/` — read on-demand when working on specific areas:

**Developer Documentation** (`.claude/docs/`):
- **`.claude/docs/modules.md`** — Registration, Screen Overlays, Booking, Volunteers, Alumni, Deadlines, Sponsor Contracts
- **`.claude/docs/invoices.md`** — Invoice PDF generation, number generation, settings, frontend
- **`.claude/docs/security.md`** — Full OWASP guidelines, field validation patterns, auth/authz rules
- **`.claude/docs/devops.md`** — CI/CD, Docker, Nginx, testing config, email, rate limiting, CSV exports
- **`.claude/docs/auth-flows.md`** — User invite flow, admin password reset
- **`.claude/docs/refactoring.md`** — Refactoring guidelines, improvement progress, hook extraction patterns

**User Documentation** (`docs/`):
- **`docs/tenant-ui-handbook.md`** — Tenant/conference organizer guide: invoicing, VAT validation, best practices

## Session Continuity

**After every response**, keep this section updated with current work state:
- What feature/fix is in progress
- Which files were modified and why
- What remains to be done

### Current Work State
- **Last completed**: Test coverage improvement sprint
- **Feature**: Comprehensive test suite expansion — security, portal, CFP, reviewer workflow
- **New backend test files** (all passing, 0 failures):
  - `test_cfp_portal_security.py` — CFP portal token/auth security
  - `test_portal_registration_security.py` — Public registration input validation + XSS
  - `test_registration_security.py` — Registration endpoint security
  - `test_registration_replacement.py` — Registration replacement workflow (557 lines)
  - `test_csv_export.py` — CSV streaming response (async-aware)
  - `test_html_sanitize.py` — HTML sanitization
  - `test_invoice_audit.py`, `test_invoice_email_helpers.py`, `test_invoice_validation.py`
  - `test_payment_reminder_helpers.py`, `test_recaptcha.py`, `test_registration_email_helpers.py`
  - `test_cross_tenant_isolation.py` — 22 tests: RLS + tenant boundary enforcement
  - `test_cfp_auth_flows.py` — 36 tests: register, verify email, login, refresh, password reset
  - `test_paper_submission.py` — 25 tests: full paper lifecycle (draft→submit→withdraw→delete)
  - `test_reviewer_workflow.py` — 23 tests: assignments, scoring, isolation, feedback
- **New frontend test files** (all passing):
  - `hooks/__tests__/useAttendeeManagement`, `usePaymentIntent`, `useSessionSelection`, `useVatCalculation`, `useVatValidation`
  - `pages/portal/__tests__/SubmitPaperPage`, `DashboardPage`, `ProfilePage`, `MessagesPage`, `MyRegistrationsPage`, `InvitationsPage`
  - `e2e/invoice-management.spec.ts`, `e2e/payment-reminders.spec.ts`, `e2e/public-registration.spec.ts`
- **Coverage after** (was → now):
  - Statements: 58.95% → 62.01%
  - Branches: 63.48% → 65.00%
  - Functions: 50.61% → 52.70%
  - Lines: 59.43% → 62.45%
  - Frontend tests: 1306 → 1505 (+199)
- **Linting**: ✅ Ruff auto-fixed unused imports in new test files
- **Status**: ⏳ Ready to commit — awaiting user approval
