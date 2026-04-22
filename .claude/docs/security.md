# Security Guidelines (OWASP)

Follow these rules when writing new code. The codebase has defense-in-depth patterns — use them consistently.

## SQL Injection Prevention
- **Always** use SQLAlchemy ORM queries or parameterized `text()` with named params — never string concatenation/f-strings in SQL
- Example: `text("SELECT ... WHERE id = :id"), {"id": value}` — never `f"SELECT ... WHERE id = {value}"`

## XSS Prevention
- **Backend**: Sanitize all user-supplied HTML through `sanitize_html()` from `app/core/html_sanitize.py` (uses `nh3`) before storing
- **Frontend**: Every `dangerouslySetInnerHTML` must use `sanitizeHtml()` from `utils/richText.ts` (uses DOMPurify)
- **Never** render raw user HTML without sanitization on either side — defense-in-depth requires both

## Input Validation
- **Pydantic schemas** are the first line of defense — add field constraints on all new schemas
- **Password validation**: min 8 chars, must contain uppercase + lowercase + digit (enforced in `schemas/user.py`)
- **Email/phone**: Use `validate_email_format()` from `app/core/validators.py` and `phonenumbers` library — never custom regex
- **File uploads**: Always use `validate_upload()` from `app/core/file_validation.py` — checks magic bytes, MIME whitelist, strips EXIF metadata, sanitizes filenames

## Field-Level Validation

**Backend** (`app/core/validators.py`):
- `validate_email_format(value)` — regex-based, returns normalized lowercase email
- `validate_phone(value)` — `phonenumbers` library, international format (+49...)
- `validate_vat_number(vat_number, country)` — three-stage cascade: python-stdnum → regex → VIES API

**Frontend** (`src/utils/validators.ts`):
- `validateEmail(value)` — regex matching backend `EMAIL_RE`
- `validatePhone(value)` — `libphonenumber-js` validation
- `normalizeUrl(value)` — auto-prepends `https://` on all URL fields

**Rules for new forms**:
1. Every **email field** must call `validateEmail()` on blur and show inline error
2. Every **phone field** must call `validatePhone()` on blur and show inline error
3. Every **URL/website field** must use `normalizeUrl()` on blur (field `type="text"`, not `type="url"`)
4. Every **VAT number field** must trigger backend validation on blur
5. All validators treat empty as valid (fields are optional unless marked required)
6. Pattern: red border (`border-red-500 dark:border-red-500`) + error message below field on blur, clears on next valid blur

**Inline field error pattern** (frontend):
- `FieldErrors` interface with nullable string per field name
- `validateField(field, value)` dispatcher → `handleFieldBlur(field, value)` updates state
- Error text: `<p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{error}</p>`
- Clear on change: `if (fieldErrors.field) setFieldErrors(prev => ({ ...prev, field: null }))`

## Authentication & Authorization
- **Protect every new endpoint** with: `CurrentUserDep`, `TenantAdminDep`, `SuperAdminDep`, or `require_module(MODULE_CODE)`
- **Conference-scoped endpoints** must call `_check_conference_admin()` or `_resolve_conference()`
- **RLS context** set automatically via `get_current_user` dependency
- **Applicant endpoints** use separate auth: `get_current_applicant` with `applicant_access` token type

## Authentication Flows

### User Invite Flow
Invite-based onboarding for new admin and team users. When created without a password, they receive an email with a link to set their own password.

- **Tenant creation** (`POST /tenants`): Super admin provides `admin_email` (required) and optionally `admin_password`. If no password: unusable hash + 7-day invite token + welcome email.
- **Team member creation** (`POST /users`): Email, name, role — no password field. Unusable hash + invite token + welcome email.
- **Invite token**: `generate_email_verification_token()` (256-bit entropy), SHA256 hash stored in `user_password_resets` table with 7-day expiry.
- **Resend invite**: `POST /users/{user_id}/resend-invite` — only for users with `last_login is None`.
- **Setup password page**: `/setup-password?token=...` — reuses `POST /auth/reset-password`.
- **Email template**: `TENANT_USER_WELCOME` with "Set up my password" button.
- **Per-tenant sender**: `noreply@{email_domain}` when configured.
- **Audit**: `USER_INVITE_SENT` logged on creation and resend.

### Admin Password Reset Flow
Token-based password reset. OWASP-compliant.

- **Forgot password**: `POST /auth/forgot-password` — rate limited 3/min, anti-enumeration (always returns success). Generates token (256-bit, SHA256 hash, 1h expiry). Invalidates previous tokens.
- **Reset password**: `POST /auth/reset-password` — rate limited 5/min. Validates token, enforces password complexity (min 8 chars, uppercase + lowercase + digit), updates hash (Argon2id). Invalidates other tokens + revokes all refresh tokens.
- **Model**: `UserPasswordReset` in `app/models/user_password_reset.py`. Migration: `102_user_password_resets`.
- **Frontend**: `/forgot-password` and `/reset-password?token=...` pages with dark mode.
- **Audit**: `USER_PASSWORD_RESET_REQUESTED` and `USER_PASSWORD_RESET_COMPLETED`.

## Tenant Isolation
- **Every tenant-scoped query** must filter by `tenant_id` — RLS is defense-in-depth, not a replacement
- **New tables** must have `tenant_id` FK + RLS policy (see migration 001 for pattern)
- **Tests**: Verify cross-tenant isolation

## Secrets & Sensitive Data
- **Never hardcode** secrets — use environment variables via `app/config.py`
- **Password hashing**: `hash_password()` / `verify_password()` from `app/core/security.py` (Argon2id)
- **Refresh tokens**: Store SHA256 hash in DB, return raw token to client once
- **Logging**: Never log passwords, tokens, or PII

## CSRF & CORS
- CORS origins whitelisted in `CORS_ORIGINS` env var — never `allow_origins=["*"]` with credentials
- Origin validation middleware rejects state-changing requests from unknown origins

## Rate Limiting
- All new auth/registration endpoints must have rate limits via `@limiter.limit()`
- Defaults: `5/minute` auth, `10/minute` CRUD, `3/minute` sensitive operations

## Dependency Security
- Pin exact versions in `requirements.txt` / `package.json` — CI runs `pip-audit` and `npm audit`
- Dockerfile images pinned to SHA digest
