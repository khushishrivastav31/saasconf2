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
- **Last completed**: Mandatory VAT validation with business rules enforcement
- **Feature**: VAT number validation based on EU VAT Directive with "warn but allow" pattern
- **Implementation scope**:
  - Backend: VAT requirement detection (REQUIRED/RECOMMENDED/OPTIONAL) based on reverse charge rules
  - Backend: 3-stage VAT validation (python-stdnum → regex → VIES) with warning system
  - Frontend: Dynamic VAT field requirement (red asterisk for required scenarios)
  - Frontend: Warning banners in invoice detail panel (error/warning/info states)
  - Documentation: Comprehensive tenant UI handbook with VAT compliance guide
- **Files created/modified**:
  - **New**: `backend/app/core/vat_requirements.py` — VAT requirement detection logic
  - **New**: `backend/tests/test_vat_requirements.py` — 7 tests for requirement levels
  - **New**: `docs/tenant-ui-handbook.md` — User guide for invoicing and VAT compliance
  - **Modified**: `backend/app/core/invoice_validation.py` — Added validate_vat_requirements()
  - **Modified**: `backend/app/schemas/invoice.py` — Added VatWarning, VatRequirement schemas
  - **Modified**: `backend/app/api/v1/invoices.py` — Integrated VAT validation in create_invoice()
  - **Modified**: `frontend/src/components/common/VatNumberInput.tsx` — Added required/level/requirementReason props
  - **Modified**: `frontend/src/pages/ConferenceDetail/tabs/RegistrationTab/BillingFields.tsx` — Dynamic VAT requirement detection
  - **Modified**: `frontend/src/components/InvoiceDetailPanel/index.tsx` — VAT warning banners
  - **Modified**: `frontend/src/types/conference.ts` — Added VAT types to Invoice interface
- **Tests**: All passing (56/56 invoice + VAT tests)
- **Linting**: ✅ Ruff, ESLint, formatting all clean
- **Key features**:
  - ✅ Reverse charge detection (Virtual/Hybrid-Online + EU B2B → VAT REQUIRED)
  - ✅ Admin override capability for warnings
  - ✅ Article 196 VAT Directive references in error messages
  - ✅ Visual feedback (red asterisk, yellow labels, colored banners)
  - ✅ Dark mode support throughout
- **Status**: ✅ Feature complete, ready for commit
