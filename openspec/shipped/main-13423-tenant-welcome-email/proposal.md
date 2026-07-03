# MAIN-13423: Tenant-creation welcome email must deliver reliably

## Status
`implemented` · Jira: MAIN-13423 · GitHub issue #314 · Branch: `fix/tenant-welcome-email`

## Methodology
TDD — Red → Green → Refactor. Failing tests first; no implementation before a
failing test proves the defect.

## Problem

When a super-admin creates a new tenant (company) with an admin user, the system
sends a welcome/invite email carrying the setup-password link. That email is sent
**before the new tenant has configured its own Resend key** — so there is no
per-tenant key to send with. Reported in GitHub issue #314 (staging, reproduced
2026-05-22): the send fails with `API key is invalid` / silently drops.

### Recon findings (2026-07-03)

Current email architecture (`backend/app/core/email/__init__.py::send_email`,
post-MAIN-13339):

1. **Step 1 — tenant Resend key.** If a per-tenant `resend_api_key` is loaded,
   send via Resend using the tenant's `from_email` (its verified domain).
2. **Step 2 — Mailgun system fallback.** No tenant key, or the tenant send raised
   → send via the system Mailgun account (`MAILGUN_API_KEY` / `MAILGUN_DOMAIN`).
   If Mailgun is not configured → console-log + `email_logs` row (only when
   `tenant_id` is set) + `return False`.

There is **no platform-level Resend key** in `config.py` anymore — only
`RESEND_FROM_EMAIL` / `RESEND_FROM_NAME` (sender identity) and the Mailgun vars.

The tenant-creation call site (`backend/app/api/v1/tenants/core.py:195-207`) has
two concrete defects:

- **`tenant_id` is not passed** to `send_tenant_user_welcome_email` (defaults to
  `None`). Consequences: `_get_tenant_email_settings` never runs, and
  `_log_email_failure` early-returns without a `tenant_id`, so a failed welcome
  email is **not recorded** in `email_logs` and Sentry loses tenant context.
- **`from_email` is forced to `noreply@{tenant.email_domain}`** — a domain that
  is **not verified** on any platform sending account for a brand-new tenant.

Net effect: on a Resend-only environment (staging has no Mailgun configured), the
tenant-creation welcome email has no valid sending path and silently fails —
exactly issue #314. Where Mailgun *is* configured it happens to be caught, but the
failure path is unobservable and delivery is accidental, not designed.

## Proposed Change

Give platform-level emails (those sent before a tenant has its own key) a valid,
verified sender — matching issue #314's first expected option: *"Use a valid
platform-level Resend key configured separately from the tenant key."*

### 1. Backend — platform Resend key as a system sender (`config.py` + `email/__init__.py`)

- Add `RESEND_API_KEY: str = ""` to `Settings` — the **platform's own** verified
  Resend account, distinct from per-tenant `Tenant.resend_api_key`. Empty by
  default (no behavior change where unset).
- In `send_email`, insert a **Step 2a — platform Resend** attempt *before* the
  Mailgun fallback: when there is no successful tenant send and
  `settings.RESEND_API_KEY` is set, send via the platform key using the verified
  `RESEND_FROM_EMAIL` / `RESEND_FROM_NAME` as the sender — **ignoring** the
  caller's `from_email` (the platform account only trusts its own domain). On any
  failure, fall through to Mailgun (Step 2b) unchanged.

Resulting precedence: **tenant Resend → platform Resend → Mailgun → console/log**.
Fully backward-compatible: with `RESEND_API_KEY` unset, Step 2a is skipped and
behavior is identical to today.

### 2. Backend — fix the tenant-creation call site (`api/v1/tenants/core.py`)

- Pass `tenant_id=tenant.id` to `send_tenant_user_welcome_email` so delivery
  failures are logged to `email_logs` and tagged in Sentry with tenant context.
- Do **not** force `from_email=noreply@{tenant.email_domain}` for the welcome
  email. The new tenant's domain is unverified on the platform account; let the
  send fall to the platform verified sender. (The tenant-Resend path is skipped
  anyway since the tenant has no key yet.)

## Out of Scope

- Async queue/retry of the welcome email until the tenant configures its own key
  (issue #314's *second* expected option) — the platform sender makes this
  unnecessary and adds infra we don't need.
- Changing the per-tenant Resend path, the Mailgun fallback, or the SMTP dev path.
- Any frontend change — this is a backend delivery fix, no UI surface.

## Acceptance Criteria

- Creating a tenant with an admin user sends the welcome email through the
  platform Resend key when `RESEND_API_KEY` is configured, from the verified
  `RESEND_FROM_EMAIL` sender (not the tenant's unverified domain).
- With `RESEND_API_KEY` unset, behavior is unchanged (Mailgun fallback), and a
  failed welcome send is now recorded in `email_logs` with the new tenant's
  `tenant_id`.
- No OpenAPI schema drift (request/response shapes unchanged) and no new
  user-visible UI (no handbook update needed).
- Existing email tests stay green; new tests cover the platform-Resend step and
  the corrected call-site arguments.

## Spec

See `openspec/specs/` once implementation lands.
