# Staging Deployment — ⚠️ SUPERSEDED

> **This directory no longer describes how staging is deployed.**
>
> Staging now runs on a **shared host**, deployed with **Ansible** from prebuilt
> **ghcr.io** images, behind **host nginx** (not containerised nginx/certbot).
> See [`provision/`](../../provision/) and the change record in
> [`openspec/shipped/main-13468-staging-server-migration/`](../../openspec/shipped/main-13468-staging-server-migration/).
>
> `setup.sh`, `init-ssl.sh`, `deploy.sh` and `nginx-init.conf` were **deleted**
> — they provisioned and deployed the retired single-VPS architecture and would
> damage the shared host if run against it. Recover them from git history if you
> need them for reference.
>
> Still live in this directory, still wired to workflows:
> `backup.sh`, `restore.sh`, `logs.sh`, `upgrade-pg1{6,7}.sh`.
> **They still assume the old paths** (`/opt/saasconf/backups`,
> `$SCRIPT_DIR/.env`) and break on the new host — see issue #444.
>
> The rest of this file documents the **old** single-VPS setup, kept for the
> old box until it is decommissioned.

---

This directory contains the Docker Compose configuration for the staging environment at `staging.sonrisa.ventures`.

## Prerequisites

- Docker and Docker Compose installed on the server
- SSH access to the staging server (46.225.88.254)
- Domain DNS configured for `staging.sonrisa.ventures` and `api.staging.sonrisa.ventures`

## Initial Setup

### 1. Create Environment File

Copy the example environment file and configure it:

```bash
cp .env.example .env
# Edit .env with your secrets
```

Required environment variables:
- `DB_PASSWORD` - PostgreSQL password
- `JWT_SECRET_KEY` - Secret key for JWT tokens (min 32 chars)
- `PII_ENCRYPTION_KEY` - Fernet key for PII column encryption (required; see [runbook](../../backend/docs/runbooks/pii-encryption-key-management.md))
- `SUPER_ADMIN_EMAIL` - Email for the super admin account
- `SUPER_ADMIN_PASSWORD` - Password for the super admin account
- `DOMAIN` - Domain name (e.g., `staging.sonrisa.ventures`)

### 2. Obtain SSL Certificates

> `init-ssl.sh` was deleted with the retired architecture. On the current host,
> TLS is issued by the provision playbook with `certbot certonly --webroot`
> (one certificate, three SANs) and renewed by the host's `certbot.timer` with
> a `systemctl reload nginx` deploy hook.
>
> Historically this script started a temporary nginx for the ACME challenge,
> obtained certificates for `staging.sonrisa.ventures` and
> `api.staging.sonrisa.ventures`, and stored them in `./certbot/conf/`.

### 3. Start Services

```bash
docker compose up -d
```

### 4. Run Database Migrations

```bash
docker compose exec backend alembic upgrade head
```

### 5. Seed the Database

**Important:** The database must be seeded to create initial modules, currencies, and the super admin account:

```bash
docker compose exec backend python -c "
import asyncio
from app.db.seed import seed_database
asyncio.run(seed_database())
"
```

This creates:
- Super admin user (using `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` from .env)
- 12 platform modules (conferences, locations, sponsors, cfp, etc.)
- 20 currencies (EUR, USD, GBP, etc.)

## Deployment

Deployments are automated via GitHub Actions on push to `main` branch. The workflow:

1. Runs backend and frontend tests
2. Deploys code via rsync
3. Rebuilds Docker images
4. Restarts containers
5. Runs database migrations
6. Runs E2E tests

**Note:** The GitHub Actions workflow does NOT run database seeding - it only runs migrations. Seeding is a one-time setup step.

## Manual Deployment

If you need to deploy manually:

```bash
# On your local machine
rsync -avz --delete \
  --exclude '__pycache__' --exclude '.pytest_cache' --exclude '*.pyc' \
  --exclude 'venv' --exclude '.env' \
  backend/ deploy@46.225.88.254:/opt/saasconf/app/backend/

rsync -avz --delete \
  --exclude 'node_modules' --exclude 'dist' --exclude '.env*' \
  frontend/ deploy@46.225.88.254:/opt/saasconf/app/frontend/

# On the staging server
cd /opt/saasconf/app/deploy/staging
docker compose build --no-cache backend frontend
docker compose up -d --force-recreate backend frontend nginx
docker compose exec backend alembic upgrade head
```

## SSL Certificate Renewal

Certificates are automatically renewed by the certbot container every 12 hours. Nginx reloads every 6 hours to pick up renewed certificates.

## Observability

### Prometheus metrics

The backend exposes Prometheus metrics at `/metrics`, but access is locked down with two layers:

1. **Nginx** returns `404` for `/metrics` on the public API host (`nginx.conf`), so the endpoint is unreachable from the public internet.
2. **Backend** requires an `Authorization: Bearer $OPS_API_KEY` header, so even inside the Docker network the endpoint is not trivially readable.

An internal Prometheus scraper must be deployed on the same Docker network and configured to target `http://backend:8000/metrics` with the bearer header, e.g.:

```yaml
scrape_configs:
  - job_name: saasconf-backend
    static_configs:
      - targets: ["backend:8000"]
    authorization:
      type: Bearer
      credentials_file: /run/secrets/ops_api_key
```

`OPS_API_KEY` is the same shared secret already used by the cron sidecars in `docker-compose.yml`.

## Troubleshooting

### Check container logs

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f nginx
```

### Check container health

```bash
docker compose ps
```

### Restart a specific service

```bash
docker compose restart backend
```

### Re-run database seed (safe to run multiple times)

```bash
docker compose exec backend python -c "
import asyncio
from app.db.seed import seed_database
asyncio.run(seed_database())
"
```

The seed script is idempotent - it skips items that already exist.

## PostgreSQL major version upgrades

A new Postgres major (e.g. 16 → 17) is **not** an in-place upgrade — the on-disk format changes between majors, so the new image refuses to start against the old volume and the deploy step ends with the `db` container `unhealthy`. The `backend` container then sits in `dependency failed`, the deploy is rolled back, and the staging site stays on the previous release.

When that happens, on the staging host:

```bash
cd /opt/saasconf/app/deploy/staging
bash upgrade-pg17.sh   # adjust filename per target major
docker compose up -d   # restart the rest of the stack against PG17
```

The script (`upgrade-pg17.sh` for the 16 → 17 cycle, `upgrade-pg16.sh` for 15 → 16, etc.) does the safe sequence: `pg_dump` the old container, `docker compose down`, remove the `postgres_data` volume, `docker compose up -d db` to start fresh on the new major, then `psql` the dump back in. A timestamped gzipped dump is left under `/opt/saasconf/backups/` for rollback. Allow ~1 minute per 100 MB of data.

Always run the script **before** re-deploying — the GitHub Actions deploy will keep failing as long as the volume is on the old major.

## Architecture

```
                    ┌─────────────────┐
                    │     nginx       │
                    │   (SSL/proxy)   │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
    ┌─────────▼─────────┐       ┌──────────▼──────────┐
    │     frontend      │       │      backend        │
    │  (React/Vite)     │       │    (FastAPI)        │
    └───────────────────┘       └──────────┬──────────┘
                                           │
                          ┌────────────────┼────────────────┐
                          │                │                │
                ┌─────────▼────┐   ┌───────▼───────┐   ┌────▼────┐
                │  PostgreSQL  │   │     Redis     │   │ Certbot │
                │     (db)     │   │   (cache)     │   │  (ssl)  │
                └──────────────┘   └───────────────┘   └─────────┘
```
