# main-13339 (follow-up) — Email: fall back to Mailgun on Resend delivery failures + report to Sentry

## Status
`draft` · Jira: follow-up to MAIN-13339 (assign real key, rename folder) · Branch: TBD

> **Folder name note:** OpenSpec uses the Jira key as the sole identifier. This is a
> follow-up bug to the shipped MAIN-13339 change. Rename this folder to the real
> Jira key (e.g. `main-XXXXX-...`) before opening the PR if a new ticket is created.

## Methodology
TDD — Red → Green → Refactor. Tests written first; no implementation before a failing test.

## Problem

MAIN-13339 (shipped) routes speaker message notifications to the conference's
`support_email` (falling back to `contact_email`). For tenant *agiletestingdays*,
the notification to `info@agiletestingdays.com` never arrived. The log shows:

```
ERROR app.core.email — Failed to send email to info@agiletestingdays.com via tenant
Resend key: The agiletestingdays.com domain is not verified. Please, add and verify
your domain on https://resend.com/domains
```

Two defects, both in `backend/app/core/email/__init__.py` → `send_email()`:

1. **No Mailgun fallback for Resend delivery/config failures.** The tenant has its own
   Resend API key, so the primary path is Resend. When Resend rejects the send, the
   `except` branch (lines ~399–422) only falls back to the system **Mailgun** account
   when the error string is the literal `"API key is invalid"`. Every other Resend
   error — including `"domain is not verified"` — sets `use_mailgun_fallback = False`,
   logs an error, writes an `email_logs` row, and `return False`. **The email is
   silently dropped** even though a perfectly good system Mailgun account is configured.
   This is the direct cause of the missing email.

2. **No Sentry visibility.** These failures only land in application logs and the
   `email_logs` table. The team wants delivery failures surfaced in Sentry so they are
   noticed without grepping logs.

> Note on *why* Resend names `agiletestingdays.com`: Resend validates the **From**
> domain against the tenant's Resend account. At send time the tenant's
> `resend_from_email` / `email_domain` resolved to an `@agiletestingdays.com` sender
> whose domain was not verified on their Resend key. The fix below makes delivery
> resilient to this regardless of which domain is misconfigured — Mailgun (a verified
> system account) becomes the safety net, and the misconfiguration is reported to Sentry.

## Proposed Change

### Backend — `backend/app/core/email/__init__.py`

1. **Broaden the Mailgun fallback.** When the tenant Resend send raises **any**
   exception, treat the system Mailgun account as the fallback (the existing behavior
   for `"API key is invalid"`), rather than only for that one string. Concretely: in
   the `except` branch, keep `use_mailgun_fallback = True` for all errors and fall
   through to the Mailgun block instead of `return False`. The final delivery outcome
   (Mailgun success / failure / not-configured) is what gets recorded in `email_logs`.

   - Resend raising means the message was **not** accepted, so re-sending via Mailgun
     cannot cause a duplicate.
   - Transient resilience is preserved: a Resend blip now degrades to Mailgun instead
     of dropping the mail.

2. **Report failures to Sentry.** Add a small `_capture_email_error()` helper (guarded
   on `settings.SENTRY_DSN`) that captures the exception with non-PII tags
   (`email.provider`, `email.type`, `tenant_id`) plus the recipient as scoped extra
   context. Call it:
   - when the tenant Resend send fails (before falling back), and
   - when the Mailgun fallback itself fails (final drop), and
   - when there is no Mailgun config and the mail is dropped (`not_configured`).

   The helper never raises — Sentry reporting must not break mail sending.

### No frontend change

This is a delivery-resilience + observability fix in the backend send path only.

## Out of Scope

- Fixing the tenant's Resend domain verification (a tenant-account configuration task,
  not code).
- Changing how `support_email` / `contact_email` is chosen (MAIN-13339 behavior stays).
- Changing the per-tenant From-address derivation logic.
- Reworking the background retry wrapper.
- Adding a new alert/notification channel beyond Sentry.

## Risks

- **Provider swap on transient errors.** Falling back to Mailgun on *all* Resend errors
  (not just config errors) means a brief Resend outage routes mail through Mailgun. This
  is desirable for deliverability; the From-address used by Mailgun is the system
  `MAILGUN_FROM_EMAIL`, so recipients may see the platform sender instead of the tenant
  sender on those fallback sends. Acceptable trade-off vs. dropping the email.
- **Sentry noise.** A misconfigured tenant could generate repeated events. Mitigated by
  tagging with `tenant_id`/`email.type` so they group, and by capturing only on actual
  delivery failure (not on success).
