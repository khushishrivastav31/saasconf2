# MAIN-13422: Tasks

> Backend-only change. One new middleware + tests. No migration, no new endpoint or
> schema, so **OpenAPI regeneration is N/A** (confirm `gen:api:check` stays clean).
> Logging is not user-visible → no handbook update.

## Gate

- [ ] **STOP after writing this spec folder — wait for user review/approval before
      writing any test or implementation code.**

## RED — tests first (`backend/tests/test_request_logging.py`)

- [ ] Authenticated `GET /api/v1/...` emits one INFO `saasconf.access` record with
      `request_id`, `method`, `path`, `route`, `status_code`, `duration_ms`,
      `tenant_id`, `user_id`, `client_ip`, `response_size`, `user_agent`, `query_keys`
      populated (assert via `caplog` on the `saasconf.access` logger).
- [ ] `request_id` in the log record equals the `X-Request-ID` response header.
- [ ] Unauthenticated/public request logs the line with `tenant_id`/`user_id` = None.
- [ ] A request that raises (force a 500) still logs a line with `status_code=500`
      and a `duration_ms`.
- [ ] `query_keys` carries only param **names**: a request with `?token=secret&foo=1`
      logs `["foo", "token"]` and **never** the value `secret` anywhere in the record.
- [ ] `path` never contains a query string; no password/token/JWT value appears.
- [ ] `/health` **does** emit an INFO access record (no path is special-cased).
- [ ] Run and confirm they fail for the right reason (middleware not yet added).

## GREEN — implementation

- [ ] Add `_client_ip(request)` + `_content_length(response)` helpers and
      `RequestLoggingMiddleware` to `backend/app/main.py` per `design.md`.
- [ ] Register it immediately **before** `CorrelationIDMiddleware` so Correlation
      wraps it (request_id_ctx set when the line is emitted).
- [ ] Use a dedicated `saasconf.access` logger; log every path at INFO (no
      special-casing for `/health`, `/health/ready`, `/metrics`).
- [ ] Re-run targeted tests → green.

## REFACTOR

- [ ] Tidy field assembly / helper; keep the field set and key names stable.
- [ ] Confirm `extra` keys don't collide with `LogRecord` reserved attributes.

## Verify (dev sweep)

- [ ] `venv/bin/python -m pytest tests/test_request_logging.py -v`
- [ ] `venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `ruff check app/ && ruff format --check app/`
- [ ] Full backend suite: `venv/bin/python -m pytest tests/ -n 4 -q`
- [ ] `cd frontend && pnpm gen:api:check` prints nothing (no schema drift) — sanity
      check that this change introduced no API surface change.

## Ship

- [ ] Move this folder `openspec/changes/main-13422-structured-request-logging/` →
      `openspec/shipped/` in the same PR.
- [ ] Conventional commit `feat(observability): structured request logging for all
      API endpoints (MAIN-13422)`; PR per workflow with `--auto --squash`.
