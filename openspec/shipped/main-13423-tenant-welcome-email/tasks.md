# MAIN-13423: Tasks

> Backend-only delivery fix. No OpenAPI drift (request/response shapes unchanged).
> No handbook update (no user-visible UI). No DB migration (`RESEND_API_KEY` is an
> env setting).

## Gate

- [ ] **STOP after writing this spec folder — wait for user review/approval
      before writing any test or implementation code.**

## RED — prove the defect

- [ ] Add failing test: `send_email` with `tenant_id` for a keyless tenant and
      `RESEND_API_KEY` set sends via the platform Resend key from `RESEND_FROM_EMAIL`
      and does not hit Mailgun.
- [ ] Add failing test: tenant-creation welcome send routes through the platform
      Resend sender (verified address), not `noreply@{email_domain}`.
- [ ] Add failing test: a failed welcome send writes an `email_logs` row carrying
      the new tenant's `tenant_id` (today dropped because `tenant_id` is `None`).

## GREEN — implement

- [ ] `backend/app/config.py`: add `RESEND_API_KEY: str = ""` (platform key), with
      a comment distinguishing it from per-tenant `Tenant.resend_api_key`.
- [ ] `backend/app/core/email/__init__.py::send_email`: add Step 2a (platform
      Resend) before the Mailgun fallback, sending from `RESEND_FROM_EMAIL` /
      `RESEND_FROM_NAME` and ignoring the caller `from_email`; on failure fall
      through to Mailgun. Capture failures to Sentry / `email_logs` as elsewhere.
- [ ] `backend/app/api/v1/tenants/core.py::create_tenant`: pass `tenant_id=tenant.id`
      to the welcome send and drop the forced `from_email=noreply@{email_domain}`.
- [ ] `.env.example`: document `RESEND_API_KEY`.

## REFACTOR

- [ ] De-duplicate Resend payload assembly between Step 1 and Step 2a only if it
      stays readable (two distinct senders must remain obvious).

## Verify (full sweep — mandatory)

- [ ] `cd backend && venv/bin/python -m pytest tests/core/test_tenants.py -v`
      (targeted) — new tests green.
- [ ] `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml` clean.
- [ ] `cd backend && ruff check app/ && ruff format --check app/` clean.
- [ ] `cd backend && venv/bin/python -m pytest tests/ -n 4 -q` — full suite green,
      email-fallback regression tests unchanged.
- [ ] Confirm no OpenAPI drift: `cd frontend && pnpm gen:api:check` prints nothing.

## Ship

- [ ] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit: `fix(email): deliver tenant-creation welcome email via
      platform Resend key (MAIN-13423)`.
- [ ] Open PR per workflow and **stop at `gh pr create`** — user merges manually
      (no `--auto`).
- [ ] Deploy follow-up (outside this PR): set a real `RESEND_API_KEY` in
      staging/prod secrets so the fix takes effect.
