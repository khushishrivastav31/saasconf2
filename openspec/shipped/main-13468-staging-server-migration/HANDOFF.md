# MAIN-13468: Handoff — pick up here

Written 2026-07-09. Steps 1-6 are done, committed, and pushed.
**Nothing has touched the new server yet.** Everything so far is files.

```bash
git fetch origin
git checkout chore/staging-server-migration
git pull
```

Branch: `chore/staging-server-migration` (8 commits, off `main`).
Read `tasks.md` for the full checklist, `design.md` for the why.

---

## ⚠️ Two artifacts do NOT travel with the repo

Both are gitignored / outside the repo on purpose. **Re-fetch them on the new
machine** — do not try to copy them out of git.

### 1. The database dump

Already on the staging server at `/opt/saasconf/backups/db_20260709_120936.sql.gz`
(42 MB, verified: 135 tables, complete-marker present, PostgreSQL **17.9**).

To pull it down again:

```bash
gh workflow run download-backup.yml --repo PepeDiaz/saasconf --ref main \
  -f backup_file=db_20260709_120936.sql.gz
# wait, then:
gh run download <run-id> --repo PepeDiaz/saasconf -D ~/saasconf-backups
```

Keep it **outside the repo**, in a `700` directory.

### 2. The staging `.env`

Already installed at `/home/deploy/saasconf/.env` on the new host (24 keys).

`get-staging-env.yml` **was deleted** once the migration used it: it exported
every staging secret (DB password, JWT signing key, `PII_ENCRYPTION_KEY`) as an
artifact downloadable by anyone who could dispatch a workflow. Recover it from
git history if it is ever genuinely needed:

```bash
git show <commit-before-deletion>:.github/workflows/get-staging-env.yml
```

The `ENV_EXPORT_PASSPHRASE` repo secret can be deleted too.

---

## Step 7 — Credentials (only you can do these)

This is the first thing that actually touches the new box.

- [ ] **SSH key — the hard gate.** Append the public half of the
      `STAGING_SSH_KEY` secret to `/home/deploy/.ssh/authorized_keys` on
      `49.13.59.187`. Ansible connects as `deploy` over plain SSH; **nothing
      runs until this exists.** You have root/console there.

- [ ] **`GHCR_READ_TOKEN`** — create the repo secret with `read:packages`
      scope, so the server can pull the private images.
      (Alternative: publish the two ghcr packages and drop the secret. Not
      recommended — the images contain backend source.)

- [ ] **Place `.env`** on the new host. It must be named exactly `.env` and sit
      beside `docker-compose.yml`; compose resolves `${VAR}` from the
      project-directory `.env`, and a differently-named file silently expands
      every value to the empty string.

      ```bash
      install -m 600 -o deploy -g deploy staging.env /home/deploy/saasconf/.env
      ```

      Before copying: drop `TRAEFIK_AUTH` (dead), and add the four vars that
      only exist as compose defaults today —
      `DATABASE_SSL_REQUIRED=false`, `PII_ENCRYPTION_KEYS_OLD=`,
      `RATE_LIMIT_LOGIN=30/minute`, `RESEND_FROM_NAME=SaaSConf`.

      `FRONTEND_BASE_URL` / `PORTAL_BASE_URL` need **no** change — the compose
      template renders them from the inventory.

- [ ] **Run the provision playbook once.** It installs nginx+certbot, puts
      `deploy` in the `docker` group, creates swap, logs into ghcr, and does the
      two-phase TLS bootstrap.

      ```bash
      cd provision
      pip install 'ansible-core==2.17.*'
      ansible-galaxy collection install community.docker

      ANSIBLE_CONFIG=$PWD/ansible.cfg \
      ANSIBLE_PRIVATE_KEY_FILE=~/.ssh/<the staging key> \
      GHCR_READ_TOKEN=<token> GHCR_READ_USER=PepeDiaz \
      ansible-playbook -v \
        -i inventory/staging.sonrisa.ventures.ini \
        -i inventory/domains/staging.ini \
        playbooks/saasconf.staging.provision.yml
      ```

      > Watch this one. Its first act is `apt install nginx certbot`, and nginx
      > is **already running there serving `dev.trendig.com`**. apt leaves the
      > running config alone, but this is the moment to be present.

- [ ] **Dispatch a deploy from this branch** (do not merge first):

      ```bash
      gh workflow run staging.yml --ref chore/staging-server-migration
      ```

      `workflow_dispatch` runs *that branch's* version of the file because
      `staging.yml` already exists on `main`. Keep the filename.

      Expect surprises in the **`build-images`** job, not the deploy: it is the
      first time `backend/Dockerfile.prod` builds in CI rather than on the VPS,
      and the first ghcr push.

---

## Step 8 — Restore + verify (before any DNS change)

- [ ] Restore the dump into the fresh `postgres:17.9-alpine` volume.
      **Major version must match** — the deploy step named "PG16" was a lie.
- [ ] Browse `https://devsaasconf.bjvsoft.net` (real DNS, real TLS — no
      `/etc/hosts` needed; all three records already resolve to the box).
- [ ] **Log in.** A successful login proves `PII_ENCRYPTION_KEY` carried over.
      If it did not, every encrypted PII column in the dump is unreadable and
      no amount of retrying helps.
- [ ] Confirm `dev.trendig.com` still returns 200 — shared host.

## Step 9 — Cutover to `staging.sonrisa.ventures`

Not a DNS change alone. `VITE_API_URL` is baked into the JS bundle at build
time, so the frontend image is wired to `api.devsaasconf.bjvsoft.net` until it
is **rebuilt**. Swap the three values in `inventory/domains/staging.ini` (the
real ones are kept there as comments), rebuild, run certbot for the real names,
then move the A records and update `STAGING_HOST`.

---

## State of the world

| Thing | Status |
|---|---|
| New host | `49.13.59.187` — shared with Trendig staging |
| Host nginx | owns 80/443, serves `dev.trendig.com`, `devtrendig.bjvsoft.net` |
| Free ports | `8001` (backend), `8081` (frontend) — both loopback-only |
| Temp DNS | `devsaasconf.bjvsoft.net`, `www.…`, `api.…` → all resolve |
| Old staging | `46.225.88.254` — **TLS cert expired 2026-07-08**, health checks red |
| Postgres | 17.9 both sides |

## Open questions

- `acme_email` is `admin@sonrisa.ventures` in `domains/staging.ini`. You said
  "use the same one" as the `.env` — cross-check `ACME_EMAIL` when you open the
  decrypted file, since Let's Encrypt expiry warnings go there. (Ignoring those
  warnings is exactly how the old cert died.)
- PR #432 (docs) is still open and unmerged.
- `backup.sh` / `restore.sh` `source "$SCRIPT_DIR/.env"` and hardcode
  `/opt/saasconf/backups`. Both break under `/home/deploy/saasconf/`.
  Currently a Step 10 follow-up — decide whether to pull it into this PR.
