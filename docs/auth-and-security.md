# Authentication, Authorization & Security

Comprehensive documentation of authentication flows, authorization model, and security features in SaaSConf.

---

## Authentication

SaaSConf has two separate authentication systems: one for admin/staff users who manage conferences, and one for applicants who submit papers through the CFP portal.

### Admin Authentication Flow

1. User submits email + password to `POST /api/v1/auth/login`
2. Backend verifies with Argon2id (`verify_password` in `app/core/security.py`)
3. Returns JWT access token (15 min) + refresh token (7 days)
4. Frontend stores tokens in localStorage via `AuthContext.tsx`
5. Every API request includes `Authorization: Bearer {access_token}` (set by Axios interceptor in `config/api.ts`)
6. When access token expires (401 response), the interceptor automatically calls `POST /api/v1/auth/refresh` and retries

### Applicant Authentication Flow

- Separate auth system for CFP applicants (paper submitters)
- Registration with email verification (`POST /api/v1/cfp-portal/{tenant_slug}/register`)
- Login returns separate JWT tokens stored via `ApplicantAuthContext.tsx`
- Uses `config/portalApi.ts` (separate Axios instance)
- Models: `CFPApplicant`, `ApplicantRefreshToken`, `ApplicantEmailVerification`
- Security module: `app/core/applicant_security.py`

### JWT Token Structure

Access token payload:

```json
{
  "sub": "user-uuid",
  "tenant_id": "tenant-uuid",
  "role": "tenant_admin",
  "modules": ["conferences", "cfp", "volunteers"],
  "is_tenant_super_user": false,
  "exp": 1708000000,
  "iat": 1708000000,
  "type": "access",
  "jti": "random-token-id"
}
```

Refresh token payload contains only: `sub`, `exp`, `iat`, `type: "refresh"`, `jti`.

The access token embeds the user's role, tenant, and module permissions so the backend can authorize requests without a database lookup on every call. The refresh token is intentionally minimal -- it exists only to obtain a new access token.

---

## Authorization (RBAC)

### Role Hierarchy

| Level | Role | Scope | Backend Dependency |
|-------|------|-------|-------------------|
| 1 | super_admin | Platform-wide | `require_super_admin()` |
| 2 | tenant_admin | Single tenant | `require_tenant_admin()` |
| 3 | Conference Admin | Per-conference | `require_conference_admin()` |
| 4 | Module User | Per-module | `require_module(code)` |

Higher-level roles automatically inherit the permissions of lower levels. A `super_admin` can do anything a `tenant_admin` can do, and a `tenant_admin` can do anything a conference admin can do within their tenant.

### Backend Dependencies (from `app/core/dependencies.py`)

The dependency injection functions that enforce authorization:

```python
CurrentUserDep  = Annotated[CurrentUser, Depends(get_current_user)]
TenantAdminDep  = Annotated[CurrentUser, Depends(require_tenant_admin)]
SuperAdminDep   = Annotated[CurrentUser, Depends(require_super_admin)]
DbSessionDep    = Annotated[AsyncSession, Depends(get_db)]
```

Conference admin check -- used on endpoints that operate on a specific conference:

```python
@router.put("/conferences/{conference_id}")
async def update_conference(
    conference_id: UUID,
    current_user: Annotated[CurrentUser, Depends(require_conference_admin)],
    ...
):
```

Module access -- restricts an entire router or endpoint to users who have the module enabled:

```python
@router.get("/conferences", dependencies=[Depends(require_module("conferences"))])
```

### Conference-Specific Access

- `UserConferenceAccess` model: links users to conferences with an `is_admin` flag
- `check_conference_admin_access(db, user_id, conference_id)` -- checks the association table
- Super admins and tenant admins automatically have admin access to all conferences

### Frontend Route Guards

The frontend mirrors the backend authorization model with route-level guards:

- `ProtectedRoute` -- redirects to `/login` if not authenticated
- `AdminRoute` -- requires `super_admin` role
- `TenantAdminRoute` -- requires `tenant_admin` or `super_admin`
- `TenantOnlyRoute` -- requires `tenant_admin` (excludes super_admin)
- `ModuleRoute` -- checks `user.modules.includes(moduleCode)`, super_admin bypasses

---

## Row-Level Security (RLS)

PostgreSQL RLS ensures tenant data isolation at the database level. Even if application code has a bug that omits a tenant filter, RLS prevents cross-tenant data leakage.

### How It Works

1. All tenant-scoped tables have RLS policies
2. Policies filter rows by `app.current_tenant_id` session variable
3. `set_rls_context()` (in `app/db/session.py`) sets these variables on each request:

```python
await session.execute(
    text("SELECT set_config('app.current_tenant_id', :tid, true)"),
    {"tid": str(tenant_id)}
)
await session.execute(
    text("SELECT set_config('app.is_super_admin', :sa, true)"),
    {"sa": str(is_super_admin).lower()}
)
```

4. Called automatically in the `get_current_user()` dependency, so every authenticated request has the correct RLS context before any queries run.

### Super Admin Bypass

When `app.is_super_admin` is `"true"`, RLS policies allow access to all rows across all tenants. This is necessary for platform-wide administration tasks.

---

## Password Security

- Algorithm: Argon2id (via `argon2-cffi`)
- Configuration: time_cost=3, memory_cost=65536 (64MB), parallelism=4
- Functions in `app/core/security.py`:
  - `hash_password(password)` -- returns hashed string
  - `verify_password(plain, hashed)` -- returns bool

Argon2id is the winner of the Password Hashing Competition and is resistant to both GPU and side-channel attacks. The memory_cost of 64MB makes brute-force attacks prohibitively expensive.

---

## Token Management

### Token Lifecycle

1. Login creates access + refresh token pair
2. Access token expires after 15 minutes
3. Refresh token expires after 7 days
4. Refresh endpoint issues new access token (refresh token rotated)
5. Logout blacklists the current token's JTI

### Token Blacklist

- Stored in Redis (`app/core/token_blacklist.py`)
- Keys: `blacklist:{jti}` with TTL matching token expiry
- Checked on every request in `get_current_user()`
- Redis initialized/closed in app lifespan handler

The TTL-based approach means blacklist entries automatically clean themselves up once the corresponding token would have expired anyway, keeping the Redis keyspace bounded.

---

## Rate Limiting

- Library: SlowAPI
- Login endpoint: 5 requests/minute per IP (`RATE_LIMIT_LOGIN`)
- API endpoints: 100 requests/minute per IP (`RATE_LIMIT_API`)
- Configured in `app/config.py`, applied in `app/main.py`

The login rate limit is deliberately strict to prevent credential stuffing attacks. General API rate limiting protects against accidental or malicious overuse.

---

## File Upload Security

All validation logic lives in `app/core/file_validation.py`.

### validate_upload(file_data, claimed_content_type, entity_type)

- Verifies MIME type using magic bytes (`filetype` library)
- Per-entity type allowed lists (e.g., `applicant_picture` only allows JPEG/PNG/WebP)
- Rejects mismatched Content-Type headers
- Falls back to claimed type only for text/office formats that lack magic bytes

### sanitize_filename(name)

- Strips path traversal (`../`, `/`, `\`)
- Removes null bytes
- Strips dangerous double extensions (`.php.jpg` becomes `.jpg`)
- Blacklist: `.php`, `.exe`, `.bat`, `.sh`, `.py`, `.js`, `.svg`, `.html`, etc.

### strip_image_metadata(file_data, content_type)

- Re-encodes JPEG/PNG/WebP images via Pillow to strip EXIF data
- Removes GPS coordinates, camera info, timestamps
- Returns original bytes for non-image types

### safe_content_disposition(filename, disposition)

- Escapes quotes and backslashes in filenames
- Uses RFC 5987 `filename*` encoding for non-ASCII names
- Prevents header injection attacks

### Document upload security (sponsor contracts)

Contract uploads (DOCX, RTF) are processed server-side before storage:

- **DOCX files**: Converted to HTML via `mammoth` — only safe HTML tags are preserved (mammoth strips macros, embedded objects, etc.)
- **RTF files**: Converted to plain text via `striprtf`, then wrapped in HTML paragraphs
- **No raw file storage**: The uploaded file is converted to HTML and discarded; only the sanitized HTML is stored in the database
- **Content served as HTML**: Contracts are edited as rich text and exported to DOCX/PDF on demand — no user-uploaded binary files are ever served directly

---

## HTML Sanitization

- Library: nh3 (in `app/core/html_sanitize.py`)
- Used for rich text content (messaging, descriptions)
- Strips dangerous HTML while preserving safe formatting tags

This prevents stored XSS attacks where a user might inject malicious scripts through rich text fields.

---

## Security Headers

Applied via `SecurityHeadersMiddleware` in `app/main.py`:

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-XSS-Protection` | `1; mode=block` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | `default-src 'self'; ...` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (production only) |

These headers defend against clickjacking (`X-Frame-Options`), MIME-type confusion (`X-Content-Type-Options`), and ensure HTTPS is enforced via HSTS in production.

---

## CORS

- Configured via `CORS_ORIGINS` setting (list of allowed origins)
- Default: `http://localhost:3000`, `http://localhost:3002`, `http://localhost:3006`
- Production: set to actual domain(s)
- Exception handlers manually add CORS headers (FastAPI exception handlers bypass `CORSMiddleware`)

The manual CORS header injection on exception handlers is important -- without it, error responses from the API would be blocked by the browser's same-origin policy, making debugging impossible on the frontend.

---

## Production Safety Checks

On startup, `_check_production_safety()` in `main.py` warns about:

- `DEBUG=True` in non-development environments
- Default `SUPER_ADMIN_EMAIL`
- `localhost` in `CORS_ORIGINS`
- Missing `RESEND_API_KEY`

These checks log warnings but do not prevent the application from starting. They serve as a safety net to catch common misconfigurations before they reach production.

---

## Key File References

| Area | File |
|------|------|
| Password hashing & JWT creation | `backend/app/core/security.py` |
| Applicant auth security | `backend/app/core/applicant_security.py` |
| Auth dependencies & RBAC | `backend/app/core/dependencies.py` |
| Token blacklist (Redis) | `backend/app/core/token_blacklist.py` |
| File upload validation | `backend/app/core/file_validation.py` |
| HTML sanitization | `backend/app/core/html_sanitize.py` |
| RLS context setup | `backend/app/db/session.py` |
| Rate limiting & security headers | `backend/app/main.py` |
| App configuration (secrets, limits) | `backend/app/config.py` |
| Admin auth routes | `backend/app/api/v1/auth.py` |
| Applicant auth routes | `backend/app/api/v1/cfp_portal/` |
| Frontend admin auth context | `frontend/src/contexts/AuthContext.tsx` |
| Frontend applicant auth context | `frontend/src/contexts/ApplicantAuthContext.tsx` |
| Frontend API interceptor | `frontend/src/config/api.ts` |
| Frontend portal API interceptor | `frontend/src/config/portalApi.ts` |
| Frontend route guards | `frontend/src/components/ProtectedRoute.tsx` |
