# PII encryption key management

_Last verified: 2026-04-17_
_Status: **foundational** — covers `PII_ENCRYPTION_KEY` lifecycle. Must be read before enabling PII column encryption (audit step 37 dual-write phase)._

## What this key protects

`PII_ENCRYPTION_KEY` is a Fernet (AES-128-CBC + HMAC-SHA256) key that
decrypts these columns once step 37 is fully rolled out:

| Table | Columns |
|-------|---------|
| `users` | `email` |
| `portal_users` | `email`, `phone` |
| `invoices` | `recipient_email`, `recipient_vat_number` |
| `billing_profiles` | `contact_email`, `contact_phone`, `vat_number` |
| `trainers` | `email`, `phone` |
| `customers` | `email`, `phone`, `vat_number` |

**Lose the key → lose the data.** There is no backdoor.

## Storage requirements (defense in depth)

A healthy deploy has the key in **three** places at all times:

1. **Production runtime env** — same delivery mechanism as `JWT_SECRET_KEY`
   (secrets manager, deploy env file, sealed secrets, whatever the infra
   uses today). Scoped to the processes that actually need it.
2. **Secrets manager** — canonical source of truth. Audit log, access
   control, versioning. Whatever team uses for DB credentials.
3. **Offline cold backup** — at least one of:
   - Printed, sealed in an envelope, in a physical safe / safety deposit box
   - Encrypted file (`age` / `gpg`) in a cloud account **separate from the
     app's cloud account** (so a single-account compromise cannot lose it)
   - Password-manager vault marked _do not share_, accessible to 2+ trusted
     humans by different paths (not a single shared login)

**Test the offline copy every 6 months.** If the service holding it can be
cancelled or locked out, move it.

## Environment rules

- **Every environment uses a different key.** Never share keys across
  dev/staging/prod. Never copy prod keys to a laptop for debugging.
- **Dev needs a key once phase (e) is live.** Login uses hash lookup
  (`User.email_hash`) and dual-write encrypts on every insert — both fail
  without a key. Generate an ephemeral dev key, add it to `backend/.env`,
  then run the backfill once to populate companions on seeded rows:

  ```bash
  cd backend
  # 1. Generate + add to .env (dev-only, don't commit)
  venv/bin/python -c "from cryptography.fernet import Fernet; print('PII_ENCRYPTION_KEY=' + Fernet.generate_key().decode())" >> .env
  # 2. Apply migration 197 if not already
  venv/bin/alembic upgrade head
  # 3. Backfill companions for pre-existing rows
  venv/bin/python -m scripts.backfill_pii_encryption
  # 4. Restart uvicorn so the new env var is picked up
  ```

  Rotating the dev key is destructive — rows encrypted with the old key
  become unreadable. Drop + reseed the dev DB if you need to rotate.
- **Production + staging refuse to boot without a key.** Startup assertion
  in `app/config.py` raises if `SENTRY_ENVIRONMENT` is production or
  staging and `PII_ENCRYPTION_KEY` is empty. Never weaken this check.

## Generating a new key

```bash
cd backend
venv/bin/python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Output is a 44-char URL-safe base64 string ending in `=`. Anything else is
not a valid Fernet key and will refuse to load.

## Initial provisioning (once per environment)

1. Generate the key with the command above.
2. Store it in all three places (runtime env, secrets manager, offline).
3. Confirm the offline copy is retrievable by someone other than you.
4. Deploy the environment. Startup log must include `PII encryption: enabled`.

## Initial backfill (step 37 phase d — once per environment)

Dual-write (step 37 phase c) keeps the `*_encrypted` + `*_hash` companion
columns in sync for every row **written after it was installed**. Rows that
existed before still have `NULL` companions. Before the read cutover (phase e)
can go live, those legacy rows need their companions filled in.

```bash
cd backend
# 1. Dry run first — prints row counts per (table, column), writes nothing.
venv/bin/python -m scripts.backfill_pii_encryption --dry-run

# 2. Real run. Commits per batch so SIGINT leaves partial progress intact.
venv/bin/python -m scripts.backfill_pii_encryption

# Knobs:
venv/bin/python -m scripts.backfill_pii_encryption --batch-size 1000 --sleep 0.05
venv/bin/python -m scripts.backfill_pii_encryption --tables customers,invoices
```

The script filters on `<col>_encrypted IS NULL AND <col> IS NOT NULL`, so
re-running after a crash or after new legacy rows are imported only touches
rows that still need it. Raw SQL (not ORM) — ORM dual-write would no-op
because the plaintext attr hasn't changed on these rows.

Distinct from the key-rotation backfill below: this one fills `NULL`
companions once. Rotation re-encrypts already-encrypted rows with a new key.

## Rotation procedure

Rotation is **phased** because old rows stay encrypted with the old key
until re-encrypted. Dropping the old key before backfill = permanent loss.

### Phase 1 — dual-key mode

1. Generate the new key (`Fernet.generate_key()` as above).
2. Move the current key → `PII_ENCRYPTION_KEYS_OLD` (comma-separated list).
3. Set the new key → `PII_ENCRYPTION_KEY`.
4. Deploy. The app uses `MultiFernet` — new writes encrypt with the new key,
   reads try the new key first and fall back through each old key.
5. Verify: decrypt any existing row (pick a recent invoice) and confirm it
   still returns plaintext. If this fails, **stop** — revert the env vars
   and investigate before continuing.

### Phase 2 — backfill

Run the backfill script to re-encrypt every row with the new key:

```bash
docker compose run --rm backend \
  venv/bin/python -m app.scripts.rotate_pii_encryption
```

The script:
- Reads each encrypted column via `MultiFernet` (old key decrypts legacy rows).
- Writes back encrypted with the new key.
- Is idempotent and restartable — re-running is safe.
- Logs row counts per table.

Allow it to complete fully. A 100k-row tenant typically takes ~15min.

### Phase 3 — retire the old key

**Only after the backfill finishes cleanly:**

1. Remove the old key from `PII_ENCRYPTION_KEYS_OLD`.
2. Deploy.
3. Verify a known recent row still decrypts (the new key handles it alone now).
4. Keep the old key in **offline backup** for ≥90 days in case of regression.
5. After 90 days, destroy the offline copy of the old key (cross-shred paper,
   delete encrypted file, remove from password manager).

## Emergency rotation (suspected leak)

If the key is suspected compromised:

1. Generate the new key immediately.
2. **Do not** skip the dual-key phase — old rows still need the leaked key
   to decrypt until backfill completes.
3. Run backfill with highest priority (can be parallelized per table).
4. Retire the leaked key from `PII_ENCRYPTION_KEYS_OLD` as soon as backfill
   is done.
5. Audit Sentry + access logs for any suspicious decrypt activity.
6. Write an incident postmortem per [incident-response.md](incident-response.md).

## Recovery from backup

When restoring from a database backup (see [restore-from-backup.md](restore-from-backup.md)):

- The backup contains encrypted ciphertext. It is only useful if the
  corresponding `PII_ENCRYPTION_KEY` (or a key in `PII_ENCRYPTION_KEYS_OLD`)
  is available to the restored environment.
- If you restore an old backup (e.g. 6 months old) after a rotation: the
  key that encrypted those rows must still be in `PII_ENCRYPTION_KEYS_OLD`,
  or the data is unreadable.
- This is why old keys stay in offline backup for ≥90 days past the
  retention window of any restore you might ever run.

## Anti-patterns — don't do these

- **Don't put the key in CI env vars.** CI runs against an empty DB;
  encryption should be disabled there. A leaked CI secret = leaked prod key.
- **Don't store the key alongside the database backup.** Same blast radius
  as storing an encryption key beside the ciphertext.
- **Don't rotate without running the backfill.** Old rows become undecryptable
  the moment the old key is removed from `PII_ENCRYPTION_KEYS_OLD`.
- **Don't share one key across environments.** A staging leak should never
  expose production data.
- **Don't debug prod encryption issues by copying the prod key locally.**
  Use a restored staging copy of the relevant data instead.
