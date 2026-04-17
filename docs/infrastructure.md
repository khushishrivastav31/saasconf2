# Infrastructure

This document covers local development, staging deployment, CI/CD, Nginx, SSL, monitoring, backups, and environment configuration.

---

## Local Development

**Source:** `docker-compose.yml`

Docker Compose starts four services:

| Service | Image / Build | Port | Notes |
|---------|--------------|------|-------|
| `db` | `postgres:15-alpine` | 5432 | Volume: `postgres_data` |
| `redis` | `redis:7-alpine` | 6379 | — |
| `backend` | `./backend` (Dockerfile) | 8000 | `uvicorn --reload`, mounts `./backend:/app` |
| `frontend` | `./frontend` (Dockerfile) | 3000 | Vite dev server, mounts `./frontend:/app` |

### Quick start

```bash
# Start all services
docker compose up -d

# Backend logs
docker compose logs -f backend

# Stop everything
docker compose down
```

### Default environment variables (local)

| Variable | Default |
|----------|---------|
| `DATABASE_URL` | `postgresql+asyncpg://saasconf:<DB_PASSWORD>@db:5432/saasconf` |
| `REDIS_URL` | `redis://redis:6379` |
| `JWT_SECRET_KEY` | `dev-secret-key-change-in-production` |
| `DEBUG` | `true` |
| `CORS_ORIGINS` | `["http://localhost:3000", "http://127.0.0.1:3000"]` |
| `VITE_API_URL` | `http://localhost:8000` |

---

## Staging Deployment

**Location:** `deploy/staging/`

### Architecture

```
Internet
  │
  ├─ https://staging.sonrisa.ventures  → Nginx (SSL) → frontend container (Nginx serving React SPA)
  ├─ https://api.staging.sonrisa.ventures → Nginx (SSL) → backend container (uvicorn)
  │
  └─ Server: 46.225.88.254 (deploy user)
       ├─ Docker containers: db, redis, backend, frontend, nginx, certbot
       ├─ Persistent volumes: postgres_data, redis_data
       └─ Backups: /opt/saasconf/backups/
```

### Services

**Source:** `deploy/staging/docker-compose.yml`

| Service | Image / Build | Notes |
|---------|--------------|-------|
| `db` | `postgres:15-alpine` | Persistent volume, health check |
| `redis` | `redis:7-alpine` | AOF persistence (`--appendonly yes`), persistent volume |
| `backend` | `Dockerfile.prod` | No debug, production env vars |
| `frontend` | `Dockerfile.prod` | Static build served by Nginx |
| `nginx` | `nginx:alpine` | Reverse proxy, SSL termination, auto-reload every 6h |
| `certbot` | `certbot/certbot` | Auto-renewal every 12h |

All services are on a shared `saasconf_network` bridge network. Services use `restart: unless-stopped`.

### Scripts

| Script | Purpose |
|--------|---------|
| `setup.sh` | Initial server setup: Docker, deploy user, firewall, log rotation |
| `init-ssl.sh` | Obtain initial Let's Encrypt SSL certificates |
| `deploy.sh` | Full deployment: git pull, build, migrate, restart, health check |
| `backup.sh` | Database backup with 7-day retention |
| `logs.sh` | View container logs (`./logs.sh backend -f`) |

### Initial server setup

```bash
# 1. On fresh server (as root)
./setup.sh

# 2. Configure environment
cp .env.example .env
nano .env  # Fill in all values

# 3. Obtain SSL certificates
./init-ssl.sh

# 4. Deploy
./deploy.sh
```

### Manual deployment

```bash
cd /opt/saasconf/app/deploy/staging
./deploy.sh 0.2.0   # Optional version tag
```

The deploy script:
1. Pulls latest code from `main`
2. Builds Docker images (`--no-cache`)
3. Runs Alembic migrations
4. Starts/restarts services
5. Cleans up old Docker images
6. Checks service health

---

## Nginx Configuration

**Source:** `deploy/staging/nginx.conf`

### HTTP (port 80)

- ACME challenge for Let's Encrypt: `/.well-known/acme-challenge/`
- Everything else redirects to HTTPS (301)

### HTTPS — Frontend (port 443)

- Server name: `staging.sonrisa.ventures`
- Proxies to `frontend:80` (Nginx serving static React build)
- Security headers: X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, HSTS, CSP

### HTTPS — API (port 443)

- Server name: `api.staging.sonrisa.ventures`
- Proxies to `backend:8000`
- Rate limiting: 10 req/s with burst of 20
- Proxy timeouts: 60s (connect, send, read)
- Security headers: X-Frame-Options, X-Content-Type-Options, HSTS

### SSL

- TLS 1.2 and 1.3
- Modern cipher suites (ECDHE-ECDSA/RSA with AES-GCM)
- Certificates from Let's Encrypt via Certbot
- Auto-renewal: Certbot checks every 12h, Nginx reloads every 6h

### Compression

- Gzip enabled for: text/plain, CSS, XML, JSON, JavaScript
- Compression level 6

---

## CI/CD Pipeline

**Source:** `.github/workflows/staging.yml`

Triggered on pushes and pull requests to `main`.

### Jobs

```
backend-tests ──┐
                 ├─→ deploy-staging ─→ e2e-tests
frontend-tests ─┘
```

#### 1. Backend Tests

- **Runner:** `ubuntu-latest`
- **Services:** PostgreSQL 15 + Redis 7
- **Steps:** Install Python 3.12 → pip install → `pytest tests/ -v --cov=app`
- **Env:** `DATABASE_URL=postgresql+asyncpg://test:test@localhost:5432/test`
- **Coverage:** Uploaded to Codecov on push

#### 2. Frontend Tests

- **Runner:** `ubuntu-latest`
- **Steps:** Install Node 20 → `npm ci` → `npx tsc --noEmit` → `npm run test:coverage`
- **Build:** `npm run build` with `VITE_API_URL=https://api.staging.sonrisa.ventures`

#### 3. Deploy to Staging (push to main only)

- SSH into `deploy@46.225.88.254`
- rsync backend, frontend, and deploy configs
- `docker compose build --no-cache backend frontend`
- `docker compose up -d --force-recreate backend frontend nginx`
- `docker compose exec -T backend alembic upgrade head`
- Health checks: `curl -f https://api.staging.sonrisa.ventures/health` and `curl -f https://staging.sonrisa.ventures`

#### 4. E2E Tests (push to main only, after deploy)

- Playwright with Chromium
- Runs against staging environment
- Secrets: `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_PORTAL_EMAIL`, `E2E_PORTAL_PASSWORD`, `E2E_TENANT_SLUG`, `E2E_CONFERENCE_ID`, `E2E_CONFERENCE_NAME`
- Artifacts: `playwright-report/` and `test-results/` (7-day retention)

---

## Scheduled Backups

**Source:** `.github/workflows/backup.yml`

- **Schedule:** Daily at 3:00 AM UTC (also supports manual trigger)
- **Mechanism:** SSH into staging server → run `backup.sh`
- **Backup script** (`deploy/staging/backup.sh`):
  1. `pg_dump` the database via `docker compose exec`
  2. Compress with gzip: `db_backup_YYYYMMDD_HHMMSS.sql.gz`
  3. Store in `/opt/saasconf/backups/`
  4. Retain last 7 backups (older ones deleted)

---

## Environment Variables

**Source:** `backend/app/config.py`

All settings are loaded via Pydantic `BaseSettings` from environment variables or `.env` file.

### Required (no defaults)

| Variable | Description |
|----------|-------------|
| `JWT_SECRET_KEY` | JWT signing key (min 32 characters) |
| `SUPER_ADMIN_PASSWORD` | Initial super admin password (min 10 characters) |

### Application

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_NAME` | `SaaSConf` | Application name |
| `APP_VERSION` | `0.1.0` | Version string |
| `DEBUG` | `false` | Enable debug mode (SQL echo, etc.) |

### Database & Cache

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://localhost:5432/saasconf` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |

### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `15` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | Refresh token lifetime |
| `SUPER_ADMIN_EMAIL` | `admin@saasconf.com` | Initial admin email |

### Security

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGINS` | `["http://localhost:3000", ...]` | Allowed CORS origins (JSON array) |
| `MAX_UPLOAD_SIZE_MB` | `10` | Maximum file upload size |
| `RATE_LIMIT_LOGIN` | `10/minute` | Login endpoint rate limit (staging overrides to `30/minute` for E2E) |
| `RATE_LIMIT_API` | `100/minute` | General API rate limit |

### Monitoring

| Variable | Default | Description |
|----------|---------|-------------|
| `SENTRY_DSN` | `""` (disabled) | Sentry DSN for error tracking |
| `SENTRY_ENVIRONMENT` | `development` | Sentry environment tag |

### Email

| Variable | Default | Description |
|----------|---------|-------------|
| `RESEND_API_KEY` | `""` (console logging) | Resend.com API key |
| `RESEND_FROM_EMAIL` | `noreply@sonrisa.ventures` | Sender email address |
| `RESEND_FROM_NAME` | `SaaSConf` | Sender display name |

### Validation rules

The `Settings` class has a `@model_validator` that enforces:
- `JWT_SECRET_KEY` must not be empty or the placeholder value, and must be at least 32 characters
- `SUPER_ADMIN_PASSWORD` must be at least 10 characters

---

## Monitoring

### Sentry

Both backend and frontend integrate Sentry for error tracking.

**Backend** (`app/main.py`):
```python
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.SENTRY_ENVIRONMENT,
        traces_sample_rate=0.1,
    )
```

**Frontend** (build arg):
- `VITE_SENTRY_DSN` and `VITE_SENTRY_ENVIRONMENT` passed at build time
- Uses `@sentry/react` package

### Health endpoint

`GET /health` returns `{"status": "healthy"}` — used by CI/CD and Nginx for health checks.

### Log management

- Docker log rotation configured via `logrotate` (7-day retention, daily rotation, compressed)
- View logs: `./logs.sh [service] [-f]`

---

## File Structure

```
deploy/staging/
├── .env.example          # Template for environment variables
├── .gitignore            # Ignores .env and certbot data
├── docker-compose.yml    # Staging services definition
├── nginx.conf            # Nginx reverse proxy config
├── init-ssl.sh           # One-time SSL certificate setup
├── setup.sh              # Initial server provisioning
├── deploy.sh             # Deployment script
├── backup.sh             # Database backup script
├── logs.sh               # Log viewer helper
├── nginx-init.conf       # Temporary Nginx config for SSL setup
└── README.md             # Deployment instructions

.github/workflows/
├── staging.yml           # CI/CD pipeline (test → deploy → E2E)
└── backup.yml            # Scheduled daily database backup
```
