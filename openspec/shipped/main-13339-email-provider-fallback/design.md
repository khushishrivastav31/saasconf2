# Design — Email provider fallback + Sentry reporting

## Current send flow (`send_email`, `backend/app/core/email/__init__.py`)

1. Auto-load per-tenant Resend settings (`api_key`, `from_email`, `from_name`) when
   `db` + `tenant_id` are passed.
2. SMTP dev escape hatch (MailHog) — unchanged.
3. **Step 1 — tenant Resend key** (`if tenant_api_key:`):
   - Build payload, `await asyncio.to_thread(resend.Emails.send, payload)`.
   - On success → `return True`.
   - On exception:
     - `"API key is invalid" in str(e)` → log warning, keep `use_mailgun_fallback = True`.
     - **else** → `use_mailgun_fallback = False`, log error, write `email_logs` row,
       `return False`.  ← **the drop**
4. **Step 2 — Mailgun system fallback** (`if use_mailgun_fallback:`): send via Mailgun,
   log success / failure / `not_configured`.

## Target send flow

Step 3's `except` collapses to a single branch:

```python
except Exception as e:
    logger.warning(
        "Tenant Resend send failed (tenant %s) for %s: %s — falling back to Mailgun",
        tenant_id, to, e,
    )
    _capture_email_error(e, provider="resend", tenant_id=tenant_id,
                         recipient=to, email_type=email_type)
    # use_mailgun_fallback stays True for every error → fall through to Step 2
```

- Remove the `use_mailgun_fallback = False` / `_log_email_failure` / `return False` block
  inside the Resend `except`. The final `email_logs` record is written by Step 2 based on
  the actual delivery outcome, so we don't double-log or mark a row `failed` when Mailgun
  then succeeds.
- The `"API key is invalid"` special-case is no longer needed as a separate branch — all
  Resend exceptions now fall through to Mailgun. (Keep the warning text generic.)

Step 2 (Mailgun) gains a Sentry capture on its own failure paths:

```python
except Exception as e:
    logger.error(f"Failed to send email to {to} via Mailgun: {e}")
    _capture_email_error(e, provider="mailgun", tenant_id=tenant_id,
                         recipient=to, email_type=email_type)
    if db is not None:
        await _log_email_failure(..., status="failed", error=str(e))
    return False
```

And the `not_configured` drop path also reports (synthesizing an error, since there is no
exception object there) — via `_capture_email_message()` or a `RuntimeError` passed to the
same helper. Implementation detail left to GREEN; keep it non-PII and guarded on DSN.

## New helper — `_capture_email_error`

```python
def _capture_email_error(
    exc: Exception,
    *,
    provider: str,
    tenant_id: UUID | None,
    recipient: str,
    email_type: str,
) -> None:
    """Report an email delivery failure to Sentry. Never raises.

    Guarded on SENTRY_DSN so it is a no-op in dev/test. Tags are non-PII;
    the recipient address is attached as scoped 'extra' context only.
    """
    settings = get_settings()
    if not settings.SENTRY_DSN:
        return
    try:
        import sentry_sdk

        with sentry_sdk.push_scope() as scope:
            scope.set_tag("email.provider", provider)
            scope.set_tag("email.type", email_type)
            if tenant_id:
                scope.set_tag("tenant_id", str(tenant_id))
            scope.set_extra("recipient", recipient)
            sentry_sdk.capture_exception(exc)
    except Exception:
        logger.warning("Failed to report email failure to Sentry", exc_info=True)
```

- Mirrors the request-id tagging style already used in `main.py`.
- `send_default_pii=False` is set globally; recipient goes in `extra`, not in a tag, and
  is only attached on actual failures.

## Why fall back on *all* Resend errors (not just config errors)

- The background sender (`send_email_background` → `_send_with_retry`) only retries when
  `send_fn` *raises*; `send_email` catches and returns `False`, so today there is no
  retry of a returned-False send. Falling back to Mailgun is the only resilience the
  failing path gets.
- A Resend exception means Resend did not accept the message → re-sending via Mailgun is
  not a duplicate.
- Distinguishing "permanent config error" from "transient" by string-matching Resend
  messages is brittle (the very bug here was a string the code didn't anticipate).
  Falling back unconditionally is simpler and strictly more deliverable.

## Alternatives considered

1. **Match more error strings** (`"not verified"`, `"API key is invalid"`, …) and keep
   `return False` for the rest. Rejected: brittle, repeats the current failure mode the
   first time Resend changes its wording or returns a new error.
2. **Pre-validate the From domain before sending.** Rejected: requires an extra Resend
   API round-trip per send and still doesn't help other error classes.
3. **Sentry only, no fallback.** Rejected: the email still drops; the team wants delivery,
   not just an alert.

## Test plan (`backend/tests/core/test_email.py`)

All tests mock the Resend module and Mailgun HTTP; patch `get_settings` so `SENTRY_DSN`
is set/unset as needed, and patch `sentry_sdk` to assert capture calls.

- **Resend domain-not-verified → Mailgun delivers.** Resend `Emails.send` raises an
  exception whose text contains `"domain is not verified"`; Mailgun configured and
  succeeds → `send_email(...)` returns `True`; Mailgun was called once; no `failed`
  `email_logs` row.
- **Sentry capture on Resend failure.** With `SENTRY_DSN` set and `sentry_sdk` patched,
  the Resend failure triggers exactly one `capture_exception` with `email.provider="resend"`.
- **Resend fails + Mailgun fails → False, both reported.** Both providers raise →
  returns `False`; a `failed` `email_logs` row is written; Sentry captured for the
  Mailgun failure too.
- **Resend fails + Mailgun not configured → not_configured.** No `MAILGUN_API_KEY` →
  returns `False`; `email_logs` status `not_configured`.
- **No DSN → no crash, no capture.** `SENTRY_DSN` unset → `_capture_email_error` is a
  no-op; send still falls back correctly.
- **Regression — invalid API key still falls back** (existing behavior preserved).
- **Regression — Resend success path unchanged** (returns `True`, no Mailgun, no Sentry).

## Files touched

- `backend/app/core/email/__init__.py` — fallback logic + `_capture_email_error` helper.
- `backend/tests/core/test_email.py` — new + regression tests.

No endpoint, schema, or migration changes → no OpenAPI regen, no Alembic.
