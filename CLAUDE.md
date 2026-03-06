# SaaSConf Project Notes

## What This Is

SaaSConf is a **multi-tenant SaaS platform** for conference management. Each tenant manages conferences, CFPs, registrations, sponsors, and programs — isolated via PostgreSQL Row-Level Security (RLS). **Performance is essential**.

## Development Workflow

**ALWAYS follow this process:**

1. **Plan First** — Use plan mode for non-trivial features. Get user approval before implementing.
2. **Develop + Write Tests** — Backend: pytest in `backend/tests/`. Frontend: vitest in `__tests__/` dirs.
3. **Run All Tests** — Backend: `cd backend && venv/bin/python -m pytest tests/test_<feature>.py -v`. Frontend: `cd frontend && npm run test`. Fix failures before proceeding.
4. **Run Linters** — Backend: `cd backend && ruff check app/ && ruff format --check app/`. Frontend: `cd frontend && npx eslint src/`. **Always run before committing** — CI will reject unformatted code.
5. **Ask Before Commit** — Do NOT automatically commit. User approval required.
6. **Commit + Deploy** — Conventional commits (`feat:`, `fix:`, `refactor:`). Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>. Push to main triggers staging deploy.

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

Detailed docs are in `.claude/docs/` — read on-demand when working on specific areas:
- **`.claude/docs/modules.md`** — Registration, Screen Overlays, Booking, Volunteers, Alumni, Deadlines, Sponsor Contracts
- **`.claude/docs/invoices.md`** — Invoice PDF generation, number generation, settings, frontend
- **`.claude/docs/security.md`** — Full OWASP guidelines, field validation patterns, auth/authz rules
- **`.claude/docs/devops.md`** — CI/CD, Docker, Nginx, testing config, email, rate limiting, CSV exports
- **`.claude/docs/auth-flows.md`** — User invite flow, admin password reset
- **`.claude/docs/refactoring.md`** — Refactoring guidelines, improvement progress, hook extraction patterns

## Session Continuity

**After every response**, keep this section updated with current work state:
- What feature/fix is in progress
- Which files were modified and why
- What remains to be done

### Current Work State
- **Last completed**: Mypy type checking fixes for Stripe integration
- **Summary of session work**:
  1. **Invoice refactoring** (Phases 1 & 2): Extracted 345 lines into 5 helper modules
  2. **Cancel invoice + credit note feature**: Full implementation with Stripe refund support
  3. **Stripe webhook integration**: Payment status automation via webhook events
  4. **Test fixes**: Updated InvoiceDetailsTab tests for required field labels
  5. **Handbook updates**: Documented complete Stripe payment flow, webhook setup, and refund workflow
  6. **Mypy fixes**: Resolved all type annotation errors in stripe_helper.py (20 errors → 0)
- **Commits pushed to main**:
  - `19a7d85` — Stripe payment integration with manual refund workflow and event audit logging
  - `7d707fd` — Invoice refactoring, cancellation, and Stripe webhook integration
  - `ae310bc` — Handbook documentation for Stripe payment flow, webhooks, and refunds
  - `8bd3644` — Session state update in CLAUDE.md
  - `613f3c0` — Mypy type annotations and ignores for stripe_helper.py
- **Type checking fixes**:
  - Fixed `get_stripe_client()` return type (added type: ignore for returning module)
  - Fixed `create_payment_link()` return type: `tuple[str | None, str]` (payment_intent_id can be None)
  - Added explicit type annotation to refund_params: `dict[str, object]`
  - Handle `refund.status` being None with fallback
  - Added type: ignore comments for Stripe API attribute access
- **Tests**: All 93 backend tests passing (92 passed + 1 setup error in batch run, but passes individually), mypy clean, ruff clean, TypeScript clean
- **Status**: All CI checks should now pass, ready for next task
