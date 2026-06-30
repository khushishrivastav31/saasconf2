# MAIN-13422: Structured request logging for all API endpoints

## Status
`draft` · Branch: _to be created on approval_ (`feat/structured-request-logging`)

## Methodology
TDD — Red → Green → Refactor.

## Problem

API endpoints lack a per-request structured log line, making it hard to trace a
single request end-to-end, debug production issues, or feed a log aggregator with
consistent request telemetry. GitHub issue #316.

### Recon findings (2026-06-30)

A lot of the foundation already exists — this change is **smaller than it sounds**:

- **JSON structured logging is already configured.** `setup_logging()`
  (`backend/app/core/logging.py:65`) emits JSON lines in production (via
  `python-json-logger`) and human-readable lines in dev. `extra={...}` fields on a
  log record are serialized as top-level JSON keys, so structured fields are free.
- **Correlation/request IDs already flow.** `CorrelationIDMiddleware`
  (`backend/app/main.py:155`) honours `X-Request-ID` / `X-Correlation-ID` (or mints a
  uuid4), stores it on `request.state.correlation_id`, publishes it into the
  `request_id_ctx` ContextVar, and echoes it back in the response headers. A
  `RequestIDFilter` (`logging.py:27`) stamps that id onto **every** log record.
- **Tenant + user are reachable after the route runs.** The auth dependency sets
  `request.state.current_user` (`dependencies.py:168`), which carries `user_id` and
  `tenant_id`. A middleware that reads it **after** `call_next` returns can capture
  both.
- **Sensitive-field redaction already exists** (`SensitiveFieldFilter`,
  `logging.py:47`) for passwords/tokens/JWTs in messages.

What is **missing** is the actual access log: there is **no middleware that emits one
structured entry per completed request**, and `uvicorn.access` is deliberately
silenced (`logging.py:103`). So today individual handlers log ad-hoc messages, but
there is no uniform `request_id · tenant · user · status · duration` record per call.

## Proposed Change

1. **Add `RequestLoggingMiddleware`** (in `backend/app/main.py`, alongside the other
   `BaseHTTPMiddleware` classes) that emits exactly **one** structured INFO log line
   per request, after the response is produced, with these fields via `extra`:
   - `request_id` — the correlation id (already stamped by the filter; also included
     explicitly so it survives if the filter is ever bypassed)
   - `method` — HTTP method
   - `path` — `request.url.path` only (**never** the query string — it can carry
     tokens; see Security)
   - `route` — the matched route template (e.g. `/api/v1/conferences/{id}`) when
     available, so aggregators can group by endpoint without high-cardinality paths
   - `status_code`
   - `duration_ms` — wall-clock handler time, `perf_counter`-based
   - `tenant_id`, `user_id` — read from `request.state.current_user` if present
     (None for unauthenticated/public/health/ops calls — that's expected)
   - `client_ip` — from `X-Forwarded-For` (first hop) falling back to
     `request.client.host`
   - `response_size` — response `Content-Length` in bytes when present, for spotting
     oversized payloads / large exports (None for streamed responses with no length)
   - `user_agent` — the `User-Agent` request header, to distinguish browser vs bot vs
     cron/ops callers
   - `query_keys` — the **names** of query parameters present (sorted), **never their
     values** — visibility into which params were used without leaking token/secret
     values (see Security)
2. **Register it inside `CorrelationIDMiddleware`** so the correlation id is set in
   the ContextVar when the line is logged (register it *before* `CorrelationIDMiddleware`
   in `main.py`, since middleware applies in reverse registration order).
3. **Log every endpoint at INFO, uniformly** — including `/health`, `/health/ready`,
   and `/metrics`. These are polled by k8s/Prometheus and add volume, but operators
   want them in the INFO access stream for full visibility; no path is special-cased.
4. **Log on the failure path too** — wrap `call_next` in `try/finally` so a request
   that raises still emits a line with `status_code=500` and a duration, then
   re-raises for the existing exception handlers.
5. **Dedicated logger** — `saasconf.access`, so operators can tune its level
   independently of application logs.

## Out of Scope

- Request/response **body** logging (PII + volume risk).
- Distributed tracing / OpenTelemetry spans (Sentry already provides error tracing).
- Changing the existing `log_security_event` or Prometheus metrics surface.
- Frontend logging changes.
- Per-endpoint decorators — a single middleware covers every route uniformly.

## Acceptance Criteria

- Every request — including `/health`, `/metrics`, `/api/v1/*`, and `/ops/*` —
  produces exactly one INFO `saasconf.access` record carrying `request_id`, `method`,
  `path`, `status_code`, `duration_ms`, `response_size`, `user_agent`, `query_keys`,
  and (when authenticated) `tenant_id` + `user_id`.
- The `request_id` in the log line matches the `X-Request-ID` response header.
- A request that raises still logs a line with `status_code=500` and a duration.
- `query_keys` lists only parameter names; no query **values**, tokens, passwords, or
  request bodies appear in any access line.

## Spec

See `openspec/specs/` once implementation lands.
