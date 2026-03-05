# SaaSConf Project Notes

## What This Is

SaaSConf is a **multi-tenant SaaS platform** for conference management. Each tenant manages conferences, CFPs, registrations, sponsors, and programs — isolated via PostgreSQL Row-Level Security (RLS). **Performance is essential**.

## Development Workflow

**ALWAYS follow this process:**

1. **Plan First** — Use plan mode for non-trivial features. Get user approval before implementing.
2. **Develop + Write Tests** — Backend: pytest in `backend/tests/`. Frontend: vitest in `__tests__/` dirs.
3. **Run All Tests** — Backend: `cd backend && venv/bin/python -m pytest tests/test_<feature>.py -v`. Frontend: `cd frontend && npm run test`. Fix failures before proceeding.
4. **Ask Before Commit** — Do NOT automatically commit. User approval required.
5. **Commit + Deploy** — Conventional commits (`feat:`, `fix:`, `refactor:`). Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>. Push to main triggers staging deploy.

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
- **Last completed**: Invoice template enhancements (6 features)
  1. **Header support**: `invoice_header_html` setting, `.page-header` CSS (`position: fixed; top: -1.5cm`), body `padding-top: 2.5cm`, applied to both PDF entry points
  2. **Multi-page**: Header + footer repeat on every page via WeasyPrint's `position: fixed` — no extra work needed
  3. **Compact items table**: `padding: 2px 6px` and `line-height: 1.2` on all table cells
  4. **Country ISO codes**: `_normalize_country_to_iso()` helper converts full names → ISO codes for `[COMPANY_COUNTRY]` and `[FISCAL_REP_COUNTRY]`
  5. **NOTES placeholder**: Added `[NOTES]` to template editor placeholder panel
  6. **Dual currency**: `second_currency` + `exchange_rate` in company info, new placeholders `[SECOND_CURRENCY]`, `[SECOND_TOTAL]`, `[SECOND_SUBTOTAL]`, `[SECOND_TAX_AMOUNT]`, `[CURRENCY_2]` now outputs second currency
- **Files modified**:
  - `backend/app/core/invoice_pdf.py` — header CSS/rendering, compact table, country normalization, dual currency placeholders
  - `backend/app/schemas/settings.py` — `invoice_header_html`, `second_currency`, `exchange_rate` fields
  - `backend/app/core/default_settings.py` — `invoice_header_html: ""` default
  - `backend/app/api/v1/settings/invoice_settings.py` — header in GET + preview
  - `frontend/src/components/InvoiceTemplateEditor.tsx` — header editor, NOTES + dual currency placeholders
  - `frontend/src/pages/.../InvoiceTemplateTab.tsx` — header state + save
  - `frontend/src/pages/.../InvoiceCompanyDataTab.tsx` — second currency + exchange rate fields
  - `backend/tests/test_invoice_settings.py` — 4 new tests (header, dual currency)
  - `backend/tests/test_invoice_pdf_helpers.py` — new: 14 unit tests (country normalization, items table)
- **Tests**: 32 invoice + 23 settings + 14 helpers = 69 backend tests passing, 1222 frontend tests passing

### Current Work State
- **Feature**: EU Countries List + Number Format Settings (Settings → Finance → Currency & Tax)
- **Backend changes**:
  - `app/core/currency_formats.py` — Added `format_amount()` helper that reads `decimal_separator`/`thousands_separator` from conference settings
  - `app/core/default_settings.py` — Added `DEFAULT_EU_COUNTRIES` constant (27 current EU members)
  - `app/schemas/settings.py` — Added `number_format_preset`, `decimal_separator`, `thousands_separator`, `currency_position`, `eu_countries` to InvoiceSettingsResponse + InvoiceSettingsUpdate with validators
  - `app/api/v1/settings/invoice_settings.py` — GET returns new fields with defaults; PUT resolves preset → individual separator fields via `get_preset_format()`
  - `app/core/invoice_pdf.py` — All `.2f` currency formatting replaced with `format_amount(value, settings)` in both entry points + items table. `[TAX_RATE]` stays `.2f` (percentage)
- **Frontend changes**:
  - `FinancialSettingsTab.tsx` — Added NumberFormatSection (6-preset dropdown with live preview) and EuCountriesSection (multi-select checkbox grid with count badge + reset button)
  - `InvoicesTab.tsx` — All `.toFixed(2)` and `.toLocaleString()` replaced with `fmtAmount()` helper that reads conference settings
- **Tests**: 13 currency format + 31 invoice settings (8 new) = 44 tests all passing, ruff clean, TypeScript clean
- **Status**: Ready to commit (pending user approval)
