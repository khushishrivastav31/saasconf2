# Secret rotation execution

_Last verified: 2026-04-17_
_Status: **advisory** — pairs with the policy doc at [../secret-rotation.md](../secret-rotation.md). That doc explains *what* to rotate and *when*; this one explains *exactly how* to execute the rotation safely._

## When to rotate

- **Scheduled** — cadence per `../secret-rotation.md#schedule`.
- **Emergency** — known or suspected leak. Do not wait for the schedule.
- **Offboarding** — a person with access leaves. Rotate anything they had
  access to, especially shared secrets.

## TL;DR

Every rotation follows the same shape:

1. Generate the new secret.
2. Store it in the secrets manager + offline backup (same rules as
   [pii-encryption-key-management.md#storage-requirements](pii-encryption-key-management.md#storage-requirements)).
3. Deploy with the new secret.
4. Verify the app still works.
5. Revoke the old secret from wherever else it's stored.

Each specific secret has details below.

## Pre-flight (do this for every rotation)

1. **Announce the rotation window.** Even if it's zero-downtime, another
   engineer debugging in parallel should know a secret changed.
2. **Confirm the offline backup of the current secret is retrievable.**
   Rotating is the moment you discover the backup is missing.
3. **Check there is no active deploy or migration in flight.** Don't stack
   risky operations.

## JWT_SECRET_KEY

**Impact:** Every session is invalidated (access tokens expire in 15min,
refresh tokens in 7d, but rotation kills both immediately). Users re-login.

```bash
# 1. Generate
NEW_JWT=$(openssl rand -hex 64)

# 2. Store in secrets manager (replace old value) + offline backup

# 3. Deploy — update the production env, then restart
cd /opt/saasconf/app/deploy/production
# Update JWT_SECRET_KEY in .env or the secrets mount
docker compose restart backend

# 4. Verify
curl -sSf https://api.{DOMAIN}/health/ready
# Attempt login from the frontend — must succeed.

# 5. Nothing else to revoke (no external service stores it).
```

## DB_PASSWORD

**Impact:** Brief connection errors during the restart window.

```bash
# 1. Generate
NEW_DB_PW=$(openssl rand -base64 32)

# 2. Update inside Postgres FIRST
docker compose exec postgres psql -U postgres -d postgres <<EOF
ALTER USER saasconf WITH PASSWORD '$NEW_DB_PW';
EOF

# 3. Update .env / secrets manager

# 4. Restart the backend (postgres does NOT need to restart)
docker compose restart backend

# 5. Verify
docker compose logs --tail=50 backend | grep -iE "database|connect"
curl -sSf https://api.{DOMAIN}/health/ready
```

If the backend fails to connect, roll back by running `ALTER USER` again
with the old password (which you still have in offline backup, right?).

## PII_ENCRYPTION_KEY

**This is different.** Rotation is phased — the old key must stay available
until every row is re-encrypted. Follow
[pii-encryption-key-management.md#rotation-procedure](pii-encryption-key-management.md#rotation-procedure)
in full. Do not treat it as a simple swap.

## RESEND_API_KEY

**Impact:** None if done right. Email sending pauses for the restart window.

```bash
# 1. Generate a new key in the Resend dashboard (keep the old one enabled for now).

# 2. Update .env / secrets manager with the new key.

# 3. Restart backend
docker compose restart backend

# 4. Verify — send a test email via an admin endpoint or trigger an invite flow.

# 5. Revoke the old key in the Resend dashboard.
```

**Never revoke the old key before deploying the new one.** An outage-free
rotation requires both keys working for the cutover window.

## SENTRY_DSN

**Impact:** Error reports stop arriving until the new DSN is deployed.
Rotation should be rare — mostly needed if the DSN was committed by accident.

```bash
# 1. In Sentry: Project Settings → Client Keys → create new DSN.

# 2. Update SENTRY_DSN_BACKEND + SENTRY_DSN_FRONTEND in env.

# 3. Rebuild frontend (DSN is baked into the JS bundle)
cd /opt/saasconf/app/deploy/production
docker compose build --no-cache frontend
docker compose up -d --force-recreate frontend backend

# 4. Verify — trigger a test error, confirm it lands in Sentry.

# 5. Revoke the old DSN (Sentry → Client Keys → Disable).
```

## BACKUP_ENCRYPTION_PASSPHRASE

**This is the scariest one.** The passphrase decrypts every existing
encrypted backup on S3. If you rotate it, old backups become unreadable
unless you keep the old passphrase in offline storage.

```bash
# 1. Generate
NEW_PASS=$(openssl rand -base64 48)

# 2. Store BOTH old and new in offline backup. Keep the old one for as
#    long as any backup encrypted with it is in retention.

# 3. Update .env — backup.sh uses the new passphrase for future backups.

# 4. Do NOT re-encrypt existing S3 backups. They stay encrypted with the
#    old passphrase; keep the old passphrase alive to decrypt them during
#    retention.

# 5. When the last backup encrypted with the old passphrase has aged out
#    of retention, you may destroy the offline copy of the old passphrase.
```

## SUPER_ADMIN_PASSWORD

This env var is only used during initial tenant seed. Rotating the env
var alone does nothing after first boot.

To actually change the super admin password, update it via the user flow
(login → settings → change password) or directly:

```bash
docker compose exec backend venv/bin/python -c "
from app.core.security import hash_password
print(hash_password('<new-password>'))
"
# Then, from inside postgres:
#   UPDATE users SET password_hash = '<output>' WHERE email = '<super-admin-email>';
```

## Post-rotation checklist

After any rotation, confirm:

- [ ] Old secret removed from all active systems (env files, CI, dashboards).
- [ ] New secret is in the secrets manager + offline backup.
- [ ] `/health/ready` is green.
- [ ] No new 5xx spike in Sentry for 15 min.
- [ ] If the rotation was emergency: write a short postmortem per
      [incident-response.md](incident-response.md).

## Anti-patterns — don't do these

- **Don't rotate multiple secrets at once.** If the deploy fails, you can't
  tell which rotation broke it.
- **Don't skip the offline backup of the new secret** to save time. You
  will regret it within 90 days.
- **Don't rotate at the end of the day / before a weekend.** If the rotation
  breaks something at 23:00, oncall is stuck.
- **Don't leave the old secret enabled "just in case".** Revoke it within
  24h of successful rotation (exception: `PII_ENCRYPTION_KEY` and
  `BACKUP_ENCRYPTION_PASSPHRASE`, which keep old copies by design).
- **Don't put the new secret in a commit to test it.** Use the deploy
  pipeline. Rotated secrets committed in git are leaked secrets.
