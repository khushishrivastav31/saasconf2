# MAIN-13468: Tasks

> Infrastructure change. No application code, so no RED/GREEN cycle and no
> OpenAPI drift. `docs/` and the handbook are unaffected (not user-facing).
> Verification is a real restore + login on the new host, before DNS moves.
>
> **Steps 1-6 touch no server.** They write files only. The two credentials
> (`GHCR_READ_TOKEN`, `authorized_keys`) are not needed until Step 7.
>
> **Iterate from this branch**, not `main`:
> `gh workflow run staging.yml --ref chore/staging-server-migration`.
> Keep the filename `staging.yml` — a new workflow file is undispatchable until
> merged.

## Gate

- [ ] **STOP after writing this spec folder — wait for user review/approval
      before creating any `provision/` files or touching `staging.yml`.**

## Prerequisites (done)

- [x] Database backup taken and verified — `db_20260709_120936.sql.gz`, 42 MB,
      135 tables, complete-marker present
- [x] `.env` exported from old staging and decrypted (21 keys)
- [x] Confirm host nginx owns 80/443 on the new box — it does
      (`dev.trendig.com`, `devtrendig.bjvsoft.net`)
- [x] Confirm host ports 8001 / 8081 are free — they are
- [x] `ansible.cfg` obtained from the Trendig project

## 1 — Ansible skeleton

- [x] `provision/ansible.cfg` (verbatim from Trendig)
- [x] `provision/inventory/staging.sonrisa.ventures.ini` — `[STAGING]` host
      `49.13.59.187`, `ansible_ssh_user=deploy` (same box as `dev.trendig.com`)
- [x] `provision/inventory/domains/staging.ini` — `[STAGING:vars]` with `domain`,
      `api_domain`, `vite_api_url`, `backend_port=8001`, `frontend_port=8081`,
      `image_tag`, `app_root=/home/deploy/saasconf`, `ghcr_*_image`
- [x] Verified: `ansible-inventory --host 49.13.59.187` resolves all vars;
      `grep '^vite_api_url=' … | cut -d= -f2-` returns the URL for CI
- [ ] **Always pass both `-i` files.** `inventory = inventory` in `ansible.cfg`
      is inert — directory inventory skips `.ini` (default
      `INVENTORY_IGNORE_EXTS`), yielding "only implicit localhost".

## 2 — Compose template

- [x] `provision/playbooks/templates/docker-compose.j2` from
      `deploy/staging/docker-compose.yml`
- [x] Remove the `nginx` service (lines 133-155)
- [x] Remove the `certbot` service (lines 210-219)
- [x] `backend`: `build:` → `image: {{ ghcr_backend_image }}:{{ image_tag }}`, add
      `127.0.0.1:{{ backend_port }}:8000`
- [x] `frontend`: `build:`/`target: prebuilt` →
      `image: {{ ghcr_frontend_image }}:{{ image_tag }}`, add
      `127.0.0.1:{{ frontend_port }}:80`
- [x] Leave `db`, `redis`, and the three cron sidecars untouched
- [x] Keep `postgres:17.9-alpine` digest pin
- [x] Render `CORS_ORIGINS`, `FRONTEND_BASE_URL`, `PORTAL_BASE_URL` from the
      inventory instead of `${DOMAIN}` — one source of truth for the domain, and
      outbound email links follow the temp domain automatically

Verified by rendering with the real inventory vars and running
`docker compose config`:

- [x] Schema valid; 7 services; no `nginx` / `certbot`
- [x] Ports publish to `127.0.0.1` only (`8001→8000`, `8081→80`)
- [x] Compose defaults still fill the four vars absent from the live `.env`
      (`DATABASE_SSL_REQUIRED`, `PII_ENCRYPTION_KEYS_OLD`, `RATE_LIMIT_LOGIN`,
      `RESEND_FROM_NAME`)
- [x] The `$${OPS_API_KEY}` escape in the cron entrypoints survives Jinja +
      Compose (renders to a literal `${OPS_API_KEY}` for the shell)

## 3 — Host nginx

- [x] `provision/playbooks/templates/nginx-saasconf.conf.j2` from
      `deploy/staging/nginx.conf` (strip `worker_processes`/`events`/`http` —
      a site file is included *inside* `http`)
- [x] Retarget upstreams: `backend:8000` → `127.0.0.1:{{ backend_port }}`,
      `frontend:80` → `127.0.0.1:{{ frontend_port }}`
- [x] Namespace the rate-limit zone `api` → `saasconf_api` (zone names are
      global; a collision fails `nginx -t` for the whole host)
- [x] `server_name` covers `{{ domain }}` **and** `{{ domain_www }}`
- [x] `provision/playbooks/templates/nginx-saasconf-bootstrap.conf.j2` —
      HTTP-only, for first-issuance ACME challenge
- [x] Repeat security headers in the `index.html` and `/assets/` locations —
      `add_header` in a location discards the server block's headers, which
      silently dropped CSP/HSTS on the SPA entry point
- [x] Install to `sites-available/saasconf` + symlink; `nginx -t` **before**
      every reload (a bad config takes `dev.trendig.com` down too) — Step 4

Verified by rendering with the real inventory and running `nginx -t` in a
`nginx:1.27-alpine` container:

- [x] Real vhost + certs present → config test successful
- [x] Bootstrap vhost, no certs → config test successful
- [x] Real vhost, **no certs** → `[emerg] cannot load certificate` — proves the
      bootstrap step is required, not optional
- [x] `saasconf_api` coexists with a foreign `api` zone — no `duplicate zone`

## 4 — Provision playbook (one-time)

- [x] `provision/playbooks/saasconf.staging.provision.yml` — idempotent, re-runnable
- [x] `deploy` user in `docker` group; `{{ app_root }}` owned by it
- [x] 2 GB swap if absent (WeasyPrint runtime PDF rendering, not builds)
- [x] `docker login ghcr.io` via `GHCR_READ_TOKEN`, as the `deploy` user
- [x] Bootstrap vhost → `nginx -t` → reload → `certbot certonly --webroot`
      (three SANs, `--deploy-hook "systemctl reload nginx"`) → real vhost →
      `nginx -t` → reload
- [x] `block`/`rescue` around both nginx changes: on failure the symlink is
      removed and nginx reloaded to a known-good config, so `dev.trendig.com`
      is never left holding a config that fails `nginx -t`
- [x] Assert `{{ app_root }}/.env` exists, then chmod `0600` / chown `deploy`
      (placed by hand — never templated, holds `PII_ENCRYPTION_KEY`)
- [x] `acme_email` is asserted, never defaulted — a guessed address means
      nobody reads the expiry warnings, which is how the old cert died
- [x] Only `ansible.builtin` modules, so CI installs just `community.docker`
      (`ansible.posix.mount` swapped for `lineinfile` on `/etc/fstab`)
- [x] Verified: `--syntax-check` passes, `--list-tasks` resolves against the
      real inventory
- [ ] **Confirm `acme_email`** — currently `admin@sonrisa.ventures`; cross-check
      against `ACME_EMAIL` in the staging `.env`

## 5 — CI: build + push to ghcr

- [x] New `build-images` job in `staging.yml`, `needs: verify`, job-level
      `permissions: packages: write`; ghcr login with the runner `GITHUB_TOKEN`
- [x] Build `saasconf-backend` from `backend/Dockerfile.prod`; push
      `:staging` + `:<sha>`
- [x] Build `saasconf-frontend` from `frontend/Dockerfile.prod` with
      `VITE_API_URL` read from `provision/inventory/domains/staging.ini`, plus
      the Sentry/version build-args the old `pnpm run build` step passed;
      push `:staging` + `:<sha>`
- [x] No `target:` for the frontend — the default (last) stage does
      `COPY --from=builder /app/dist` and is the full build. The `prebuilt`
      stage exists only for the old build-on-server flow; BuildKit skips it.
- [x] Lowercase the image paths — ghcr rejects uppercase and the org is
      `PepeDiaz`. Uses `tr`, not `${VAR,,}` (bash 4+, untestable on macOS).
- [x] Fail loudly if any inventory value resolves empty
- [x] GHA layer cache (`type=gha`, per-image scope)
- [x] Verified: workflow YAML parses; the resolve step simulated against the
      real inventory yields the right image names, tags and API URL, for both a
      raw SHA and an RC tag like `v1.0.0-rc.1`

The job is additive — `deploy-staging` still runs the old ssh/rsync flow until
Step 6 rewires it. Nothing is removed yet.

## 6 — CI: replace ssh/rsync with Ansible

- [x] `provision/playbooks/saasconf.staging.deploy.yml` — ghcr login → tag
      running images `:previous` → pull → render compose → `up -d --wait db redis`
      → `alembic upgrade head` in a one-off container → `up -d` (recreate) →
      seed → loopback health checks → prune
- [x] `provision/playbooks/saasconf.staging.rollback.yml` — retag `:previous`
      over the deployed tag, recreate with `pull: never`, health-check
- [x] In `staging.yml`, deleted 16 steps: `Compute image tag`,
      `Set up frontend tooling`, `Build frontend dist`, `Ensure swap`,
      `Reclaim docker disk space`, `Deploy backend source`,
      `Deploy configuration`, `Deploy frontend dist`,
      `Tag previous images for rollback`, `Build frontend image on staging`,
      `Build backend image on staging`, **`Reset database for PG16`**,
      `Rebuild and restart containers`, `Seed platform data`,
      `Verify containers are running` (+ old `Set up SSH` keyscan)
- [x] Added: `pip install 'ansible-core==2.17.*'`,
      `ansible-galaxy collection install community.docker`, `ansible-playbook …`
- [x] `deploy-staging` now `needs: [verify, build-images]`, deploys the
      immutable `:<sha>` tag
- [x] Rewired `rollback-staging` to the rollback playbook — it referenced
      `STAGING_PATH` and the deleted `saasconf_nginx_staging` container
- [x] Parameterised the health check, `Notify success`, and the **whole E2E
      job** from the inventory — they hardcoded `staging.sonrisa.ventures` and
      would have tested the OLD box after cutover
- [x] Dropped the now-unused `STAGING_HOST` / `STAGING_USER` / `STAGING_PATH`
      top-level env
- [x] Keep the filename `staging.yml` so the branch stays dispatchable
- [ ] If `needs: verify` is dropped to speed up iteration, **restore it before
      merge** — CI must gate the merge

Findings while wiring it up:

- [x] **`ansible-core` must be 2.17+**, not Trendig's `ansible==9.*` (core
      2.16): `community.docker` 5.x refuses 2.16, and `docker_compose_v2` lives
      there. Verified 2.17 + community.docker 5.2.1 resolves `pull: never`,
      `wait`, `recreate`, `services`.
- [x] **No `docker system prune -af` on the shared host** — it would reap the
      Trendig stack's images too. The playbook prunes dangling-only, no volumes.
- [x] All three playbooks pass `--syntax-check`; `staging.yml` passes
      `actionlint` (incl. shellcheck) with zero findings

## 7 — Credentials (user-only, first deploy to the new host) ✅

- [x] Authorize the CI key on `49.13.59.187`.
      **Gotcha:** the `STAGING_SSH_KEY` secret is the key labelled
      `github-actions-staging` (`SHA256:M3c4fQaK…`), NOT the personal key on the
      dev laptop (`SHA256:0geUhfYX…`, `bjvtamayo78@gmail.com`) — both open the
      OLD box, which makes the wrong one look right. Identify it by matching the
      fingerprint the runner offers in the SSH debug log against the old box's
      `authorized_keys`.
- [x] Place `.env` at `/home/deploy/saasconf/.env` — 24 keys, `0600`, checksum verified
- [x] `acme_email` = `jose.diaz@sonrisa.ventures` (from `ACME_EMAIL`)
- [x] `GHCR_READ_TOKEN` repo secret created
- [x] Provision playbook run, phase by phase, `dev.trendig.com` 200 after each:
      packages `changed=0` · user `changed=0` · **swap 2 GB created** ·
      ghcr (Trendig credential guard passed) · env `changed=0` ·
      tls · **cert issued** (3 SANs, ECDSA, renew_hook + active timer) · vhost
- [x] Deploy dispatched from `release/v0.17.0`

**Environment gate.** The `staging` environment uses
`deployment_branch_policy: {protected_branches: true, custom_branch_policies: false}`
— not a name pattern. Only branches carrying a branch-protection rule may
deploy: `main` and `release/*`. Hence `release/v0.17.0`, cut from the topic
branch. `can_admins_bypass` is true but the account is not an admin.

## 8 — Restore + verify ✅

- [x] Uploaded `db_20260709_120936.sql.gz` (sha256 verified), took a
      `pre_restore_seed_*.sql.gz` snapshot first (38 KB — proving the DB held
      only seed data)
- [x] Stopped `backend` + the three crons, terminated connections,
      `DROP DATABASE` / `CREATE DATABASE`, asserted **0 tables** before loading
- [x] Restored: `psql` exit 0, empty stderr
- [x] Counts match the dump exactly: `tables=135 users=16 tenants=2
      conferences=3 attachments=14 alembic=228`
- [x] `alembic_version=228` **is** this branch's head — no post-restore migration
- [x] **Login returns 200** against the restored data → `PII_ENCRYPTION_KEY`
      carried over; encrypted PII columns are readable
- [x] `dev.trendig.com` still 200 throughout

> **`docker exec` needs `-i` for a heredoc.** Without it psql reads EOF, runs
> nothing, and exits 0 — so `DROP DATABASE` silently no-ops and the "restore"
> then aborts against the existing schema with `type … already exists`. The
> first attempt failed exactly this way and destroyed nothing.

## 9 — Cutover (temp domain → real staging domain)

- [ ] Swap `domain` / `api_domain` / `vite_api_url` in `domains/staging.ini`
      (real values kept as comments there)
- [ ] **Rebuild + push the frontend image** — `VITE_API_URL` is baked in at build
      time; a DNS change alone leaves the SPA calling `api.devsaasconf…`.
      The backend image is runtime-configured and needs no rebuild.
- [ ] Point `FRONTEND_BASE_URL` / `PORTAL_BASE_URL` in `.env` at the real domain
- [ ] Lower DNS TTL a day ahead (united-domains)
- [ ] `certbot --nginx -d staging.sonrisa.ventures -d api.staging.sonrisa.ventures`
- [ ] Repoint `staging.` and `api.staging.sonrisa.ventures` A records
- [ ] Update the `STAGING_HOST` Actions secret
- [ ] Watch a full deploy + E2E run
- [ ] Keep the old box powered on for a rollback window
- [ ] Restore `needs: verify` on `deploy-staging` if it was dropped

## 10 — Follow-ups

- [ ] Fix `backup.sh` / `restore.sh`: they `source "$SCRIPT_DIR/.env"` and assume
      `/opt/saasconf/backups`; both break under the new layout
- [ ] Drop `TRAEFIK_AUTH` from `.env.example`; remove the stale Traefik lines in
      `deploy/DEPLOYMENT.md` and `deploy/staging/deploy.sh`
- [ ] Decide on `RESEND_API_KEY` — compose never passes it to the backend, which
      sends via Mailgun. Either wire it up or delete it.
- [ ] Move `openspec/changes/main-13468-staging-server-migration/` →
      `openspec/shipped/` in the merging PR
- [ ] Decommission `46.225.88.254` once the rollback window closes
