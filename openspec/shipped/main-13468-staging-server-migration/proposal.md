# MAIN-13468: Migrate staging to the new server (Ansible + ghcr)

## Status
`draft` · Branch: `chore/staging-server-migration`

## Methodology
Infrastructure change, not application behaviour. No RED/GREEN unit tests —
nothing in `backend/app/` or `frontend/src/` changes. Verified by standing the
stack up on the new host, restoring a real dump, and exercising login through
host nginx **before** any DNS change. The existing CI suite must stay green.

## Problem

Staging currently runs on a dedicated VPS at `46.225.88.254` and deploys via
~15 imperative `ssh`/`rsync` steps in `.github/workflows/staging.yml`, including
`docker compose build` **on the server** (hence the swap-creation and
disk-prune steps that precede it).

We want to move staging onto the existing Trendig staging host and deploy it the
way that project does: **Ansible playbooks + prebuilt images pulled from
ghcr.io**, per [`TrendigGmbH/trendig#48`](https://github.com/TrendigGmbH/trendig/pull/48).

### Recon findings (2026-07-09)

**The new host is shared.** It already runs the Trendig stack:

```
trendig-backend-1   ghcr.io/trendiggmbh/trendig/backend:production_7f29760   0.0.0.0:8000->8000/tcp
trendig-database-1  postgres:11    (unpublished)
trendig-redis-1     redis:alpine   (unpublished)
```

- **Host nginx (apt) owns `0.0.0.0:80` and `0.0.0.0:443`**, serving
  `dev.trendig.com` and `devtrendig.bjvsoft.net`. Our `nginx` and `certbot`
  *containers* (`deploy/staging/docker-compose.yml` lines 133-220) bind `80:80`
  and `443:443` and therefore **cannot start** on this host. They must be removed.
- Host port `8000` is taken by `trendig-backend-1`. Port `8001` is only
  *exposed* by that container, not published — so `8001` and `8081` are free.
- Their Postgres is **11**; ours is pinned `postgres:17.9-alpine`. Separate
  containers on a separate Compose network — no interaction.

**Current staging facts** (gathered while debugging the failed deploy):

| Thing | Value |
|---|---|
| Postgres | **17.9** — restore onto 17.x, not 16 |
| DB dump | `db_20260709_120936.sql.gz`, 42 MB, verified: 135 tables, complete-marker present |
| Uploads | BYTEA in Postgres — the dump captures everything |
| `.env` | 21 keys, exported via `get-staging-env.yml` (PR #442) |
| TLS | Cert expired **2026-07-08**; containerised certbot renewal has been failing silently for ~a month |

**Two hazards to fix in passing:**

1. `staging.yml` line 233, *"Reset database for PG16 (one-time fix)"*, runs
   `docker volume rm` on every volume matching `postgres_data` whenever
   `pg_isready` fails. It runs on **every deploy**, guarded only by that health
   check. It did not fire on the last run ("Database is healthy — no reset
   needed"), but it is a loaded gun pointed at staging's only database.

   **On the shared host it is strictly worse.** The filter is
   `docker volume ls | grep postgres_data`, and Compose prefixes volumes with the
   project name: ours becomes `saasconf_postgres_data`, Trendig's
   `trendig_postgres_data`. Both match. Had this ever fired on the new box it
   would have attempted to destroy **Trendig's database volume as well**. Delete
   it before the first deploy there — this is the highest-priority item in the
   change, not a tidy-up.
2. `TRAEFIK_AUTH` in the live `.env` is dead — Traefik appears nowhere except
   `deploy/DEPLOYMENT.md` and a stale line in `deploy.sh`.

## Proposal

Deploy SaaSConf staging to the shared host as a **co-tenant behind host nginx**,
using Ansible, with images built in CI and pulled from ghcr.

Three changes, separable but shipped together:

1. **Images move to ghcr.** CI builds `saasconf-backend` and `saasconf-frontend`
   from the existing `Dockerfile.prod` files and pushes `:staging` + `:<sha>`.
   No more server-side build, so the swap-creation, disk-prune, and all three
   rsync steps disappear.
2. **Reverse proxy moves to the host.** Drop the `nginx`/`certbot` services;
   bind `backend` to `127.0.0.1:8001` and `frontend` to `127.0.0.1:8081`; add
   two server blocks to the host nginx and issue certs with `certbot --nginx`,
   joining the existing renewal timer.
3. **Deploy moves to Ansible.** `provision/` mirrors the Trendig layout. The
   ssh/rsync steps in `staging.yml` collapse to `ansible-playbook`.

### Single source of truth for per-environment values

`provision/inventory/domains/staging.ini` holds `domain`, `api_domain`,
`vite_api_url`, `backend_port`, `frontend_port`, `image_tag`. **Both** consumers
read it: CI greps `vite_api_url` for the frontend `--build-arg`, and Ansible
consumes the same file as inventory vars for `docker-compose.j2` and the nginx
vhost template.

This matters because `VITE_API_URL` is **baked into the JS bundle at build
time** (`frontend/Dockerfile.prod` `ARG` → Vite inlines it). It cannot be
supplied at deploy time, which is why staging and production need distinct
frontend image tags. Making it runtime-configurable would require the frontend
to read `window.__ENV__` from a container-rendered `/config.js` — deliberately
out of scope.

## Decisions locked with the user

- **Ansible, not plain ssh.** Chosen for idempotency and a codified provisioning
  story on a brand-new host.
- **App root is `/home/deploy/saasconf/`**, matching Trendig's `/home/deploy/trendig`.
- **The env file lands as `.env`**, not `.env.staging`. Compose auto-loads a file
  named exactly `.env` from the project directory; `${DB_PASSWORD}` and friends
  resolve via *interpolation*, for which the compose file has no `env_file:`
  directive. A differently-named file would require `--env-file` on every
  invocation and, if forgotten, expands every value to the empty string silently.
- **`VITE_API_URL` stays a build-arg**, sourced from `domains/staging.ini`.
- **The pipeline must stay deployable from a topic branch**, not just `main`, so
  this migration can be iterated against the new host before it merges. See
  `design.md` § "Deploying from a topic branch".
- **The two credentials are deferred to Step 7.** `GHCR_READ_TOKEN` and the
  `authorized_keys` entry are only needed for the first real deploy; Steps 1-6
  write files and touch nothing on the host.
- Cutover is gated on a verified restore; the old box stays powered on for rollback.

## Non-goals

- Production migration (staging only).
- Runtime-configurable frontend API URL.
- Fixing certbot on the old host — it is being retired, and host certbot
  replaces it.
- Migrating the Trendig stack or touching its nginx server blocks.

## Risks

- **`PII_ENCRYPTION_KEY` must be copied byte-for-byte.** Regenerating it makes
  every encrypted PII column in the dump permanently unreadable. Login on the
  restored stack is the canary.
- **Shared host.** A bad nginx config or a port grab breaks `dev.trendig.com`.
  Mitigate: our vhost is a new file in `sites-available`, our containers bind
  loopback only, `nginx -t` before every reload.
- **Postgres major mismatch.** Restoring a 17.9 dump into anything else fails.
- `backup.sh` / `restore.sh` `source "$SCRIPT_DIR/.env"` and assume
  `/opt/saasconf/backups`. Both need path updates for the new layout.
