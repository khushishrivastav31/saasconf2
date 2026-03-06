# DevOps & Infrastructure

## Code Quality
- **Linting**: Ruff (backend), ESLint (frontend) — enforced in CI + pre-commit
- **Type checking**: mypy (backend), TypeScript `--noEmit` (frontend)
- **Formatting**: Ruff format (backend), Prettier (frontend)
- **Pre-commit hooks**: ruff, ruff-format, mypy, eslint, prettier, trailing-whitespace, end-of-file-fixer, hadolint, conventional-pre-commit, detect-secrets

## Mypy Config (`pyproject.toml`)
- `ignore_missing_imports = false` with per-module overrides for stub-less packages
- Core settings: `check_untyped_defs`, `no_implicit_optional`, `warn_redundant_casts`
- Migrations excluded; API route modules have relaxed error codes due to SQLAlchemy

## Docker
- Base images pinned to specific SHAs in all Dockerfiles
- CI uses concurrency controls to cancel redundant runs

## Dev Files
- `.nvmrc` (Node 20), `.python-version` (3.12), `.editorconfig`, `.env.example`
- `.vscode/settings.json` + `extensions.json`
- `Makefile` with targets: `init`, `dev`, `test`, `quality`, `dev-clean`, `db-reset`

## Domain Constants (`app/constants.py`)
- `ModuleCode` — all module identifiers
- `ResourceType` — audit log resource types
- `EntityType` — polymorphic attachment types
- `InvoiceStatus` — invoice lifecycle states
- `ContractStatus` — sponsor contract lifecycle

## Health Probes & Ops
- `GET /health` — liveness probe
- `GET /health/ready` — readiness probe (DB + Redis)
- `POST /ops/data-retention-cleanup` — cron cleanup (nightly)
- `POST /ops/send-deadline-reminders` — cron reminders (hourly)
- Both ops endpoints auth via `Authorization: Bearer <SUPER_ADMIN_PASSWORD>`

## Deployment
- CI tags images as `:previous` before rebuilding for rollback
- Migrations run without `|| true` — deploy fails properly on errors
- Health checks retry 5 times with 10s intervals
- `docker compose up -d --wait db redis` then app services with `--no-deps`
- **Staging DB**: PostgreSQL 16 (`postgres:16.6-alpine`)

## Nginx (staging)
- Config template processed by `envsubst` at container start
- **envsubst escaping**: `"\$$DOMAIN \$$API_DOMAIN"` in docker-compose.yml
- Full CSP header + security headers (HSTS, X-Frame-Options, etc.)

## Email Sending (`app/core/email.py`)
- Uses `resend` library via `asyncio.to_thread()`
- Falls back to console logging when `RESEND_API_KEY` not set
- Per-conference toggle via `conference.settings.email_sending_enabled`
- Per-tenant sender: resolves `noreply@{email_domain}` when tenant has `email_domain`

## Rate Limiting
- `slowapi` with `get_remote_address` key function
- Auth: `5/minute` (login), `3/minute` (forgot-password), `10/minute` (refresh)
- Registration: `10/minute` (individual), `5/minute` (bulk/VAT)

## CSV Exports
- `app/core/csv_export.py`: `csv_response()` (small) and `stream_csv_export()` (large, 1000-row batches)
- All CSVs include UTF-8 BOM for Excel compatibility
- Conference exports capped at 50k rows

## Attachment URL Lookups
- `app/core/attachment_urls.py`: `get_latest_attachment_url()` (single) and `batch_get_attachment_urls()` (batch)
- Use batch version in list endpoints to avoid N+1 queries

## CI Coverage
- Backend threshold: 50%, Frontend threshold: 55%
- HTML coverage reports uploaded as artifacts (14-day retention)

## Testing (`backend/tests/`)
- Uses real PostgreSQL test database (`saasconf_test`) with per-test table truncation
- `conftest.py` sets env overrides **before** importing app code
- `NullPool` engine avoids asyncpg loop errors
- RLS bypass: `set_config('app.is_super_admin', 'true', true)`
- Redis explicitly initialized/closed in `client` fixture
- Rate limiting disabled globally via `RATELIMIT_ENABLED=false`
- 930+ backend tests, all passing
