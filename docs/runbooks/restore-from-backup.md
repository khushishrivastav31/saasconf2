# Restore from backup

_Last verified: 2026-04-17_
_Status: **advisory** — no production environment exists yet. Verified against the staging backup/restore scripts at `deploy/staging/backup.sh` + `restore.sh`._

## When to restore

Restore (as opposed to roll back a deploy — see [production-rollback.md](production-rollback.md)) when the schema is fine but the **data** is wrong:

- Accidental destructive query (`DELETE` without `WHERE`, `TRUNCATE`, bad `UPDATE`).
- Ransomware / suspected tamper.
- Logical corruption caught late (bad migration wrote wrong values for hours).
- Cross-tenant data leak that needs point-in-time state verification.

If only recent writes are bad, consider restoring to a **side database** and copy specific tables back — a full restore loses every legitimate write since the backup.

## TL;DR

1. Freeze writes (put the app in read-only or stop the backend).
2. Identify the backup file (S3 or `/opt/saasconf/backups/`).
3. Restore into a side DB first, verify, then cut over.
4. Start the backend, run smoke checks.
5. Write a postmortem per [incident-response.md](incident-response.md).

## Prerequisites

- SSH access to the production host.
- `BACKUP_ENCRYPTION_PASSPHRASE` if backups are encrypted (stored in the
  same secrets manager as `JWT_SECRET_KEY`).
- **`PII_ENCRYPTION_KEY` that matches the backup's encryption key.** If you
  are restoring an old backup made before a PII key rotation, the pre-rotation
  key must still be available in `PII_ENCRYPTION_KEYS_OLD` (see
  [pii-encryption-key-management.md](pii-encryption-key-management.md)).
- `AWS_*` credentials if the backup lives only on S3.

## Procedure

### 1. Freeze writes

Option A — stop the backend entirely (cleanest, causes downtime):

```bash
cd /opt/saasconf/app/deploy/production
docker compose stop backend
```

Option B — keep `nginx` + `frontend` serving read-only (requires read-only
app support, not built yet). Default to Option A.

### 2. List available backups

```bash
cd /opt/saasconf/app/deploy/production
./restore.sh --list
```

If the backup is only on S3:

```bash
aws s3 ls s3://<BACKUP_S3_URI>/
aws s3 cp s3://<BACKUP_S3_URI>/db_YYYYMMDD_HHMMSS.sql.gz.enc /opt/saasconf/backups/
```

### 3. Pick the target — **restore to a side DB first**

Never overwrite the live DB on the first attempt. Create a scratch DB:

```bash
docker compose exec postgres psql -U saasconf -d postgres -c "CREATE DATABASE saasconf_restore_test;"
```

Restore into it:

```bash
RESTORE_TARGET_DB=saasconf_restore_test \
BACKUP_ENCRYPTION_PASSPHRASE="$(cat /opt/saasconf/secrets/backup_passphrase)" \
./restore.sh /opt/saasconf/backups/db_YYYYMMDD_HHMMSS.sql.gz.enc
```

### 4. Verify the restored data

Connect to the scratch DB and run sanity checks:

```bash
docker compose exec postgres psql -U saasconf -d saasconf_restore_test
```

```sql
-- Row counts match expectations?
SELECT count(*) FROM tenants;
SELECT count(*) FROM users;
SELECT count(*) FROM invoices;

-- Most recent data timestamp?
SELECT max(created_at) FROM invoices;

-- Did a specific known-good row survive?
SELECT id, invoice_number, total FROM invoices WHERE invoice_number = 'INV-...';

-- PII still decrypts? (post step 37 only)
-- Start the backend pointed at this DB and hit a read endpoint.
```

If any of those fail, try an older backup. **Do not proceed to cutover
with unverified data.**

### 5. Cut over

Once the scratch restore is verified:

```bash
# Rename live → keep-as-evidence, scratch → live
docker compose exec postgres psql -U saasconf -d postgres <<EOF
ALTER DATABASE saasconf RENAME TO saasconf_broken_YYYYMMDD;
ALTER DATABASE saasconf_restore_test RENAME TO saasconf;
EOF
```

### 6. Bring the backend up

```bash
cd /opt/saasconf/app/deploy/production
docker compose start backend
sleep 15
curl -sSf https://api.{DOMAIN}/health/ready
```

Watch logs for 5 minutes:

```bash
docker compose logs -f backend | grep -iE "error|fernet|decrypt"
```

`Failed to decrypt PII` errors mean the wrong `PII_ENCRYPTION_KEY` was used
— see [pii-encryption-key-management.md](pii-encryption-key-management.md#recovery-from-backup).

### 7. Reconcile lost writes

Every write between the backup timestamp and the freeze is lost. For each
affected table, check:

- Is there an audit log (`audit_logs`) that captured the changes?
- Is there an external source of truth (Stripe for payments, Resend for
  sent emails) that can be replayed?
- Do customers need to re-enter recent data? If so, notify them.

### 8. Keep the broken DB as evidence

Don't drop `saasconf_broken_YYYYMMDD` until the postmortem is complete.
It's the only forensic record of what went wrong.

### 9. Postmortem

Write one per [incident-response.md](incident-response.md). A restore
always deserves a postmortem — if you needed one, something failed upstream.

## Anti-patterns — don't do these

- **Don't restore directly over the live DB.** Restore to a side DB, verify,
  then rename. Mistakes at the restore step compound the original incident.
- **Don't skip the decryption check** post step 37. A restore that succeeds
  at the SQL level but produces unreadable PII is a worse state than the
  original problem.
- **Don't run the app against the restored DB until the migration version
  matches.** If the backup is from an older schema, run `alembic upgrade head`
  on the scratch DB before cutover.
- **Don't delete the old backup just because the restore worked.** Keep the
  full backup chain until forensics + audit requirements are met.
- **Don't restore without telling customers** if any data loss window is
  customer-visible. Silent data rollback erodes trust worse than the outage did.
