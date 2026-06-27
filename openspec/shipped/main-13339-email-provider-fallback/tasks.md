# Tasks — Email provider fallback + Sentry reporting

## Methodology: TDD (Red → Green → Refactor)

No implementation starts without first seeing the test fail for the right reason.

## Status Legend
- `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 1 — Backend: Mailgun fallback on Resend failures + Sentry

### RED
- [ ] Add tests to `backend/tests/core/test_email.py`:
  - [ ] Resend raises `"... domain is not verified ..."`, Mailgun configured & succeeds
        → `send_email(...)` returns `True`; Mailgun called once; no `failed` log row.
  - [ ] Same, asserting one Sentry `capture_exception` with tag `email.provider="resend"`
        (patch `sentry_sdk`, `SENTRY_DSN` set).
  - [ ] Resend raises + Mailgun raises → returns `False`; `email_logs` row `failed`;
        Sentry captured for Mailgun failure.
  - [ ] Resend raises + Mailgun not configured → returns `False`; `email_logs`
        `not_configured`.
  - [ ] `SENTRY_DSN` unset → no capture, no crash, fallback still works.
  - [ ] Regression: `"API key is invalid"` still falls back to Mailgun.
  - [ ] Regression: Resend success → `True`, Mailgun not called, no Sentry capture.
  - [ ] Run → **expect failure** (current code returns `False`/drops on non-key errors).

### GREEN
- [ ] In `backend/app/core/email/__init__.py`:
  - [ ] Add `_capture_email_error(exc, *, provider, tenant_id, recipient, email_type)`
        helper — guarded on `settings.SENTRY_DSN`, non-PII tags, recipient as `extra`,
        never raises.
  - [ ] In the tenant-Resend `except` branch: drop the `use_mailgun_fallback = False` /
        `_log_email_failure` / `return False` block; log a generic warning, call
        `_capture_email_error(provider="resend", ...)`, and fall through to Mailgun for
        all errors.
  - [ ] In the Mailgun `except` branch: call `_capture_email_error(provider="mailgun", ...)`
        before logging the failure row.
  - [ ] In the Mailgun `not_configured` drop path: report to Sentry too (non-PII).
- [ ] Run targeted tests → **expect green**.

### REFACTOR
- [ ] Remove now-dead `"API key is invalid"` special-case branching if it is fully
      subsumed by the unified fallback (keep a generic warning).
- [ ] Confirm `_capture_email_error` import of `sentry_sdk` is lazy (inside the function),
      matching `main.py`.
- [ ] Update the module docstring's "Flow" section to note Resend failures now degrade to
      Mailgun and are reported to Sentry.

---

## Phase 2 — Full sweep (all green before PR)

- [ ] `cd backend && venv/bin/python -m pytest tests/core/test_email.py -v`
- [ ] `cd backend && venv/bin/python -m pytest tests/ -n 4 -q`
- [ ] `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `cd backend && ruff check app/ && ruff format --check app/`
- [ ] No endpoint/schema change → no `pnpm gen:api`; confirm with `pnpm gen:api:check`
      (should print nothing).
- [ ] Frontend untouched → no handbook update required.

---

## Phase 3 — Ship

- [ ] Move this folder from `openspec/changes/` to `openspec/shipped/` in the same PR.
- [ ] Conventional commit, e.g.
      `fix(email): fall back to Mailgun on Resend failures and report to Sentry`.
