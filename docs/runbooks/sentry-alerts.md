# Sentry alerts runbook

Sentry is the primary error-monitoring channel for the SaaSConf backend. The
SDK is initialised at [app/main.py:34](../../backend/app/main.py#L34) when
`SENTRY_DSN` is set; `traces_sample_rate=0.1` and `send_default_pii=False`
are the current defaults.

This runbook captures the **minimum viable alert rules** that must exist in
the Sentry UI. Treat the list as the source of truth — if Sentry is ever
rebuilt, reconstruct these rules before pointing anyone at the new project.
(If we later introduce Terraform or `sentry-cli` for managing alerts as
code, convert this doc to a configuration file and keep it in sync.)

## Alert catalogue

Each rule below names:
- **Trigger** — the condition that fires the alert.
- **Notifies** — where it must land (Slack channel, PagerDuty service, email).
- **Why** — the incident class this rule exists to catch; without it we'd
  be flying blind.

### 1. Error-rate spike

| Field      | Value                                                           |
|------------|-----------------------------------------------------------------|
| Trigger    | `event.type:error` count in a 5-minute window rises >20% versus the trailing hour, **and** is above 10 events absolute. |
| Notifies   | `#saasconf-alerts` Slack                                        |
| Why        | Catches rollout regressions the moment they hit traffic, before a customer emails us. |
| Cooldown   | 30 minutes                                                      |

The absolute-count floor stops a 0→5 ratio change from paging us at 02:00.

### 2. New issue (first-seen)

| Field      | Value                                                           |
|------------|-----------------------------------------------------------------|
| Trigger    | An issue fires for the first time in the last 24 hours.         |
| Notifies   | `#saasconf-alerts` Slack                                        |
| Why        | Every net-new exception is worth looking at — it's either a real bug or noise we should filter. |
| Cooldown   | n/a (per-issue alert)                                           |

### 3. Unhandled 5xx

| Field      | Value                                                           |
|------------|-----------------------------------------------------------------|
| Trigger    | Any event where `level:error` AND `http.status_code >= 500` AND the exception is not one of our explicit `SaaSConfException` subclasses (see [app/core/exceptions.py](../../backend/app/core/exceptions.py)). |
| Notifies   | `#saasconf-alerts` Slack + email to on-call                     |
| Why        | Anything that escaped the exception handler middleware is either a bug or a dependency failure and needs immediate triage. |

### 4. Unhandled `SaaSConfException`

| Field      | Value                                                           |
|------------|-----------------------------------------------------------------|
| Trigger    | Any event whose exception type matches `app.core.exceptions.SaaSConfException` (including subclasses like `AuthenticationError`, `AuthorizationError`, `ValidationError`). Exclude `RateLimitExceeded` from slowapi — it's expected noise. |
| Notifies   | `#saasconf-alerts` Slack (daily digest acceptable)              |
| Why        | Domain errors should surface as clean 4xx responses, not Sentry events. If one is landing here, our error handler has a gap. |

### 5. Transaction-time regression (warn)

| Field      | Value                                                           |
|------------|-----------------------------------------------------------------|
| Trigger    | p95 transaction duration for any endpoint >2s over a 10-minute window, sustained for 15 minutes. |
| Notifies   | `#saasconf-alerts` Slack                                        |
| Why        | Performance regressions are usually invisible until a customer complains. p95 catches outliers the dashboards flatten. |
| Cooldown   | 1 hour                                                          |

### 6. Cron check-in missed (if configured)

| Field      | Value                                                           |
|------------|-----------------------------------------------------------------|
| Trigger    | Any Sentry monitor check-in that is late or missing (backup, nightly MV refresh, etc.). |
| Notifies   | `#saasconf-alerts` Slack                                        |
| Why        | A silent cron is worse than a failed one. Check-ins tell us the job actually ran. |

## Verifying alerts

After configuring each rule:

1. In the Sentry UI, open the **Alerts** page and confirm each rule is
   listed and active.
2. Trigger a harmless test event from staging —
   `curl -fsS staging/debug/sentry-test` (if you've added a test endpoint) or
   a deliberate failing test run — and confirm Slack receives the message.
3. Ensure the on-call rotation in Slack has members assigned; an alert that
   pages nobody is worse than no alert.

## Change management

- Any change to these rules must also update this runbook in the same PR.
- If an alert becomes noisy (>3 pages/week without real signal), tune the
  threshold rather than silencing — and record the decision in the
  corresponding ADR (or open a new one).

## Related

- [Incident response](./README.md) (TODO — lands with the Phase H runbook work)
- [Secret rotation](../secret-rotation.md) — includes `SENTRY_DSN` rotation
- Sentry project: `saasconf-backend` (see `SENTRY_DSN` in the prod environment)
