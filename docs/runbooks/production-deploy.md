# Production deploy

_Last verified: 2026-04-17_
_Status: **advisory** — no production environment exists yet. This runbook defines the procedure so the first prod cutover follows it._

## TL;DR

1. Tag the release per [release-tagging.md](release-tagging.md).
2. SSH to prod host, `git fetch --tags && git checkout vX.Y.Z`.
3. Rebuild images, run migrations, rolling-restart app services.
4. Smoke-check `/health`, `/health/ready`, and a signed-in API call.
5. If anything is wrong: [production-rollback.md](production-rollback.md).

## Prerequisites

The following must be true **before** prod cutover. If any is missing, stop and fix first.

- [ ] A separate prod host / cluster exists (not shared with staging).
- [ ] Managed PostgreSQL with automated snapshots + PITR is provisioned.
- [ ] `deploy/production/.env` exists with:
  - `JWT_SECRET_KEY` rotated (not staging's key)
  - `SUPER_ADMIN_PASSWORD` rotated
  - `OPS_API_KEY` rotated
  - `DATABASE_SSL_REQUIRED=true` (the managed DB requires it; see [audit-report-2026-04.md](../audit-report-2026-04.md))
  - `RATE_LIMIT_LOGIN=10/minute` (prod value — no Playwright override)
  - `SENTRY_ENVIRONMENT=production`
  - `SENTRY_DSN_BACKEND` + `SENTRY_DSN_FRONTEND` point at the prod Sentry project
- [ ] DNS for `app.{DOMAIN}` and `api.{DOMAIN}` points at prod host.
- [ ] Let's Encrypt certs issued for both hosts.
- [ ] First backup succeeded and `./backup.sh` cron is scheduled.
- [ ] [Sentry alerts](sentry-alerts.md) exist in the prod project.

## Procedure

### 1. Pre-flight on your laptop

```bash
git fetch --tags
git checkout vX.Y.Z                       # the tag you're deploying
git log --oneline $(git describe --tags --abbrev=0 HEAD^)..HEAD
```

Read the commit log. Anything looks surprising? Stop. Investigate.

### 2. Pre-flight on the host

```bash
ssh deploy@$PROD_HOST
cd /opt/saasconf/app
git fetch --tags
docker compose -f deploy/production/docker-compose.yml ps     # current state before we touch anything
```

Capture the currently-running image tags — note them somewhere, they're your rollback target:

```bash
docker inspect --format='{{index .Config.Labels "org.opencontainers.image.revision"}}' saasconf_backend_prod
docker inspect --format='{{index .Config.Labels "org.opencontainers.image.revision"}}' saasconf_frontend_prod
```

### 3. Announce the deploy

Post in the team channel:

> Deploying `vX.Y.Z` to production (previous: `vA.B.C`). ETA 5–10 min.

### 4. Check out the tag + rebuild

```bash
cd /opt/saasconf/app
git checkout vX.Y.Z

cd deploy/production
docker compose build --no-cache backend frontend
```

### 5. Run migrations **before** swapping traffic

Migrations must be backward-compatible with the currently-running app version so there is no downtime between `upgrade head` and the container restart.

```bash
docker compose run --rm backend alembic upgrade head
```

If a migration is *not* backward-compatible (rare — we try to avoid these): schedule it as a two-step release (add column → deploy → switch code → deploy → drop old column).

### 6. Rolling restart

```bash
# Keep db + redis untouched; --no-deps avoids recreating data stores
docker compose up -d --force-recreate --no-deps backend frontend nginx

# Wait for health
sleep 20
docker compose ps
```

### 7. Smoke tests

```bash
# From the host (internal)
docker compose exec -T backend curl -sf http://localhost:8000/health
docker compose exec -T backend curl -sf http://localhost:8000/health/ready

# From your laptop (external)
curl -sSf https://api.{DOMAIN}/health
curl -sSf -I https://app.{DOMAIN}/
```

`/health` should be 200. `/health/ready` should show `database: ok` and `redis: ok`. Then do one authenticated API round-trip from the UI (log in, load a conference, load a training). If any step fails: [production-rollback.md](production-rollback.md).

### 8. Verify Sentry is quiet

Watch the prod Sentry project for 5 minutes. Any new error group appearing in that window belongs to this deploy. Investigate before declaring success.

### 9. Announce success

```
✅ `vX.Y.Z` deployed. Rollback target if needed: `vA.B.C`.
```

### 10. Bump `APP_VERSION` in `.env` (if not already tag-driven)

Staging's now-deleted `deploy.sh` did this with `sed` on `.env` — keep the same
pattern in prod so Sentry release tags match the deployed version. (Staging's
Ansible deploy does not bump `APP_VERSION`; it reads whatever `.env` holds.)

## Common failure modes

- **Migration stuck holding a lock** → abort the migration, check `pg_stat_activity` for blockers, retry off-peak.
- **Backend healthy but frontend 502** → nginx pointing at stale backend container, restart nginx: `docker compose restart nginx`.
- **TLS cert expired mid-deploy** → certbot container unhealthy; check `docker compose logs certbot`, then `docker compose exec nginx nginx -s reload`.
- **CPU pegged** → probably an `N+1` in new code — roll back immediately, investigate offline.
