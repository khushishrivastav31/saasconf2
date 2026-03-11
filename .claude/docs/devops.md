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
- `POST /ops/send-payment-reminders` — cron payment reminders (daily)
- All ops endpoints auth via `Authorization: Bearer <SUPER_ADMIN_PASSWORD>`

## Backup & Restore

### Scripts
| File | Purpose |
|---|---|
| `deploy/staging/backup.sh` | Run a backup (DB + optional uploads) |
| `deploy/staging/restore.sh` | Restore DB (+ optional uploads) from a backup file |

### Running a Backup
```bash
cd /opt/saasconf/app/deploy/staging
./backup.sh                    # normal run
BACKUP_DRY_RUN=1 ./backup.sh  # dry-run (prints what it would do, no changes)
```

### Restoring from a Backup
```bash
cd /opt/saasconf/app/deploy/staging

# List available backups
./restore.sh --list

# Restore DB (plain)
./restore.sh /opt/saasconf/backups/db_20260301_030000.sql.gz

# Restore DB (encrypted)
BACKUP_ENCRYPTION_PASSPHRASE=secret ./restore.sh /opt/saasconf/backups/db_20260301_030000.sql.gz.enc

# Restore DB + uploads together
BACKUP_ENCRYPTION_PASSPHRASE=secret \
RESTORE_UPLOADS_FILE=/opt/saasconf/backups/uploads_20260301_030000.tar.gz.enc \
./restore.sh /opt/saasconf/backups/db_20260301_030000.sql.gz.enc
```
Restore stops app containers, drops/recreates the DB, streams the dump in, then restarts everything.

### Backup Features
- **GFS local retention**: 7 daily + 4 weekly (Sundays) + 12 monthly (1st of month)
- **Integrity check**: every dump is validated with `gzip -t` immediately after creation
- **Encryption**: set `BACKUP_ENCRYPTION_PASSPHRASE` → files get AES-256-CBC `.enc` suffix
- **Offsite / S3**: set `BACKUP_S3_URI=s3://bucket/prefix` + AWS credentials → uploaded via `aws s3 cp`
- **Uploads backup**: set `BACKUP_UPLOADS_DIR=/path/to/uploads` → creates a `uploads_DATE.tar.gz`
- **Storage class**: S3 uploads use `STANDARD_IA` (Infrequent Access) to reduce cost

### Environment Variables (set in `deploy/staging/.env`)
| Variable | Required | Description |
|---|---|---|
| `DB_USER`, `DB_NAME`, `DB_PASSWORD` | Yes | PostgreSQL credentials |
| `BACKUP_ENCRYPTION_PASSPHRASE` | Optional | Enables AES-256 encryption |
| `BACKUP_S3_URI` | Optional | e.g. `s3://mybucket/saasconf-backups` |
| `AWS_ACCESS_KEY_ID` | With S3 | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | With S3 | AWS credentials |
| `AWS_DEFAULT_REGION` | With S3 | Default: `eu-central-1` |
| `BACKUP_UPLOADS_DIR` | Optional | Host path to uploads/media directory |

### Automation (GitHub Actions)
- Workflow: `.github/workflows/backup.yml`
- Schedule: daily at **03:00 UTC** (also triggerable manually via `workflow_dispatch`)
- On success: writes a file listing + disk usage summary to the GitHub Actions job summary
- On failure: sets `::error::` annotation; check the workflow run for logs
- Artifact: `backup-report-<run_id>` uploaded with **30-day** retention

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
