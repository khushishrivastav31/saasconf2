# Production rollback

_Last verified: 2026-04-17_
_Status: **advisory** — no production environment exists yet. See [production-deploy.md](production-deploy.md) prereqs._

## When to roll back

Roll back if any of the following are true **right after a deploy**:

- `/health/ready` reports `database: unavailable` or `redis: unavailable`.
- Sentry shows a new error group with >5 events in <2 minutes.
- A core user flow is broken (login, load conference, load training list, create invoice).
- 5xx rate > 1% of traffic for > 3 minutes on the API host.

Do **not** use rollback for data corruption — that's a restore, see [restore-from-backup.md](restore-from-backup.md).

## TL;DR

1. Check out the previous tag on the host.
2. Rebuild + restart containers (skip migrations — see below).
3. Smoke-check `/health`.
4. Announce.

## Procedure

### 1. Identify the rollback target

During the original deploy you should have captured `vA.B.C` (the previous tag). If you didn't:

```bash
# On the host
cd /opt/saasconf/app
git tag --sort=-creatordate | head -5
```

Pick the tag immediately preceding the broken deploy.

### 2. Handle migrations **first**

This is the part that can bite you. Three cases:

**Case A — the bad deploy did not run a new migration.**
Nothing to do for the schema. Continue to step 3.

**Case B — the bad deploy ran a backward-compatible migration.**
Leave the schema at `head`. The previous app version was written against the older schema but will work fine with the extra column / index because the migration was additive. Continue to step 3.

**Case C — the bad deploy ran a breaking migration.**
Stop. You have two sub-options:

1. **Forward fix:** write and deploy a `vX.Y.Z+1` that works with the new schema. Usually faster than a true rollback.
2. **Downgrade the migration:**
   ```bash
   docker compose run --rm backend alembic downgrade -1
   ```
   Only if the migration has a working `downgrade()` (most do; verify first: `alembic show <revision>`). **Then** proceed to step 3.

### 3. Check out the previous tag

```bash
cd /opt/saasconf/app
git fetch --tags
git checkout vA.B.C
```

### 4. Rebuild + restart

```bash
cd deploy/production
docker compose build --no-cache backend frontend
docker compose up -d --force-recreate --no-deps backend frontend nginx
sleep 20
docker compose ps
```

### 5. Smoke test

```bash
curl -sSf https://api.{DOMAIN}/health
curl -sSf https://api.{DOMAIN}/health/ready
```

Then do one authenticated round-trip from the UI.

### 6. Announce + document

```
⏪ Rolled back to `vA.B.C`. Broken release: `vX.Y.Z`. Investigation in <link-to-incident-doc>.
```

Then write the incident up per [incident-response.md](incident-response.md). Every rollback deserves a short postmortem — even a "migration was fine, the bug was in the new endpoint" one-pager.

## Anti-patterns — don't do these

- **Don't `git pull` on the host to revert.** That creates a detached commit that diverges from tagged state. Always `git checkout vA.B.C`.
- **Don't `docker compose down` the database** while rolling back — there's no reason to bounce Postgres, and restart time compounds downtime.
- **Don't delete the broken tag.** Keep it so the incident history is preserved; mark the GitHub release as superseded instead.
- **Don't skip the post-rollback smoke test** because "we're going back to the version we just had running." The container rebuild might have picked up a new base-image vulnerability that broke a dependency — verify empirically.
