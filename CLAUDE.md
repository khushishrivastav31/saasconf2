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
- **Last completed**: VAT rate management cleanup + dual currency support
- **Feature 1** (Migration 115): Tenant-specific country VAT/tax rates with full CRUD operations
  - Each tenant manages their own country rates (VAT, GST, Sales Tax, etc.)
  - Location: Conference → Settings → Financial Settings → "Country VAT/Tax Rates"
  - Full CRUD in `EuVatRatesReference.tsx`
- **Feature 2** (Migration 116): Removed manual Conference VAT Rate management
  - Conference tax rate now **auto-pulls** from Country VAT/Tax Rates based on conference country
  - No manual add/edit/delete for conference rates
  - Read-only display: "Current tax rate for [Country]: X.XX%" (green) or warning if country not in list (yellow)
  - Simplified `VatRatesSection.tsx` to read-only, removed `conference_vat_rates` table
- **Feature 3**: Dual currency support for invoices
  - Added `second_currency` and `exchange_rate` fields to `InvoiceCompanyInfo` schema
  - Added UI in `InvoiceCompanyDataTab.tsx` for second currency (ISO code) and exchange rate
  - Displays totals in second currency alongside primary currency on invoices
- **Backend changes**:
  - Migration 115: Added `tenant_id` to `vat_rates_by_country` table
  - Migration 116: Dropped `conference_vat_rates` table + RLS policy
  - Removed: `app/models/conference_vat_rate.py`, `app/schemas/conference_vat_rate.py`
  - Updated: `app/api/v1/conferences/fiscal_representative.py` (tax-info endpoint + VAT calculation both use `or_()` to fall back to global rates when tenant-specific rate not found)
  - Updated: `app/core/vat_calculation.py` (removed ConferenceVatRate import, added fallback to global rates for both conference and customer country lookups)
  - Updated: `app/schemas/fiscal_representative.py` (added TaxInfoResponse without vat_rates array)
  - Updated: `app/schemas/settings.py` (added second_currency and exchange_rate to InvoiceCompanyInfo)
- **Frontend changes**:
  - `EuVatRatesReference.tsx`: Full CRUD for country rates (2-char ISO code, country name, standard rate 0-100%)
  - `VatRatesSection.tsx`: Rewritten to read-only display
  - `InvoiceCompanyDataTab.tsx`: Added dual currency fields
  - `types/conference.ts`: Removed ConferenceVatRate interfaces, simplified TaxInfo
- **Testing**: ✅ Ruff clean (344 files), ESLint clean, 1222 frontend tests passing
- **Status**: ✅ Complete, backend restarted, ready to test and commit (pending user approval)
