# MAIN-13423: Design

## Email sending precedence (after this change)

```
send_email(...)
  ├─ SMTP set + non-prod?            → SMTP (MailHog) [unchanged, dev only]
  ├─ Step 1: tenant_api_key present  → Resend via tenant key, from = tenant domain
  │                                     success → return True
  │                                     failure → fall through (capture to Sentry)
  ├─ Step 2a: settings.RESEND_API_KEY set  [NEW]
  │       → Resend via PLATFORM key, from = RESEND_FROM_EMAIL / RESEND_FROM_NAME
  │         (caller from_email deliberately ignored — platform account only
  │          trusts its own verified domain)
  │         success → return True
  │         failure → fall through to Step 2b (capture to Sentry)
  └─ Step 2b: Mailgun system account  [unchanged]
          not configured → console log + email_logs row (if tenant_id) + False
```

## Why "platform Resend before Mailgun", not "replace Mailgun"

Mailgun stays as the last-resort system fallback so nothing regresses for tenants
who rely on it today. The platform Resend key is additive: it only participates
when `RESEND_API_KEY` is set. Staging (Resend-only, no Mailgun) gets a working
path; production keeps Mailgun as the safety net. Ordering Resend first keeps the
platform on a single provider identity (`RESEND_FROM_EMAIL`) for its own mail.

## Why ignore the caller `from_email` in the platform-Resend step

Resend validates the **From** domain against the *sending account*. The platform
account only verifies its own domain (`RESEND_FROM_EMAIL`, e.g.
`noreply@sonrisa.ventures`). A brand-new tenant's `email_domain` is never verified
there, so honoring `from_email=noreply@{tenant.email_domain}` would get the send
rejected — the very failure #314 reports. The platform step therefore always sends
from the platform's own verified address. (Step 1, the tenant's *own* key, keeps
using the tenant domain — correct, because that key trusts it.)

## Call-site change — `api/v1/tenants/core.py::create_tenant`

Current (lines ~185-207):
```python
from_email = f"noreply@{tenant.email_domain}" if tenant.email_domain else None
send_email_background(
    send_tenant_user_welcome_email,
    db,
    email=...,
    token=raw_token,
    company_name=tenant.name,
    ...
    from_email=from_email,          # ← unverified tenant domain
)                                    # ← tenant_id omitted → defaults to None
```

Change to:
```python
send_email_background(
    send_tenant_user_welcome_email,
    db,
    email=...,
    token=raw_token,
    tenant_id=tenant.id,            # ← failures now logged with tenant context
    company_name=tenant.name,
    ...
    # from_email dropped — platform verified sender is used
)
```

`send_tenant_user_welcome_email` already accepts `tenant_id` and `from_email`
kwargs, so no signature change there. Passing `tenant_id=tenant.id` means
`_get_tenant_email_settings` runs and finds no `resend_api_key` (new tenant) →
Step 1 skipped → Step 2a (platform Resend) handles it.

> Note: `_get_tenant_email_settings` will derive `from_email = noreply@{domain}`
> from the tenant's `email_domain` and set it on the call. That value is only ever
> consumed by Step 1 (tenant key, skipped here) and Mailgun (which overrides From
> to `MAILGUN_FROM_EMAIL`). Step 2a ignores it by design, so the derived tenant
> domain can never leak into the platform send.

## Test plan (RED first)

Backend, extend `backend/tests/core/test_tenants.py` (or a focused email test):

1. **RED — platform Resend used when no tenant key.**
   With `RESEND_API_KEY` set (patched settings) and a mocked `resend.Emails.send`,
   assert `send_email(... tenant_id=<new tenant, no key>)` calls the platform
   Resend path with `from` == `RESEND_FROM_EMAIL` and returns `True`, and that
   Mailgun is *not* called. Fails before Step 2a exists.
2. **RED — welcome email at tenant creation delivers via platform Resend.**
   `POST /api/v1/admin/tenants` with `admin_email`; assert the welcome send routes
   through the platform Resend path (mock) with the verified sender, not
   `noreply@{email_domain}`. Note: `send_email_background` is a no-op under
   `TESTING=true`, so test `send_tenant_user_welcome_email` / `send_email`
   directly rather than asserting through the background task.
3. **RED — failed welcome send is logged with tenant_id.**
   With no platform key and Mailgun forced to fail, assert an `email_logs` row is
   written carrying the new tenant's `tenant_id` (today it is dropped because
   `tenant_id` is `None`).
4. **Regression — key unset.** With `RESEND_API_KEY == ""`, Step 2a is skipped and
   the existing Mailgun-fallback tests still pass.

GREEN: add `RESEND_API_KEY` to `config.py`, add Step 2a to `send_email`, fix the
call site. REFACTOR: factor the platform-Resend send to share payload assembly
with Step 1 if it reduces duplication without obscuring the two senders.

## Config / ops

- `RESEND_API_KEY` added to `Settings` (default `""`) and documented in
  `.env.example` alongside the existing `RESEND_FROM_EMAIL` / Mailgun vars.
- No migration — this is an env setting, not a schema change.
- Deploy note for the ticket: set a real platform `RESEND_API_KEY` in staging/prod
  secrets for the fix to take effect; unset keeps today's Mailgun behavior.
