# MAIN-13422: Design

## Approach: one middleware, not per-endpoint decorators

A `BaseHTTPMiddleware` wraps `call_next` for every route, so a single class covers
all current and future endpoints with no per-handler changes. This matches the
existing pattern in `main.py` (`CorrelationIDMiddleware`, `SecurityHeadersMiddleware`,
…) and is the lowest-risk insertion point.

## Where the data comes from

| Field | Source | Notes |
|---|---|---|
| `request_id` | `request.state.correlation_id` | Set by `CorrelationIDMiddleware`; also in `request_id_ctx` |
| `method` | `request.method` | |
| `path` | `request.url.path` | **Path only** — query string deliberately excluded |
| `route` | `request.scope["route"].path` | The matched template; falls back to `path` if no route matched (404) |
| `status_code` | response object / `500` on raise | |
| `duration_ms` | `time.perf_counter()` delta | Monotonic; rounded to 2 dp |
| `tenant_id` | `request.state.current_user.tenant_id` | Set by auth dep during `call_next`; `None` if unauthenticated |
| `user_id` | `request.state.current_user.user_id` | Same; `None` if unauthenticated |
| `client_ip` | `X-Forwarded-For[0]` else `request.client.host` | App runs behind nginx, so XFF is the real client |
| `response_size` | `response.headers["content-length"]` (int) | `None` when absent (e.g. streamed exports with no length) |
| `user_agent` | `request.headers["user-agent"]` | `None` if header absent |
| `query_keys` | `sorted(request.query_params.keys())` | **Names only** — values never logged |

`tenant_id` / `user_id` are only known **after** the route's dependencies run, which
is why the log is emitted *after* `call_next`, reading `request.state.current_user`.
Public-portal, health, and ops endpoints have no `current_user` — those fields log as
`None`, which is correct and expected.

## Middleware ordering

Middleware applies in **reverse** registration order (innermost registered first).
We need the correlation id set in the ContextVar when we log, and we read
`request.state.current_user` which is populated during `call_next`. So
`RequestLoggingMiddleware` must sit **inside** `CorrelationIDMiddleware`:

```
# registration order in main.py (existing → new):
CORSMiddleware                  # innermost
OriginValidationMiddleware
RequestSizeLimitMiddleware
RequestLoggingMiddleware        # NEW — register here, inside CorrelationID
CorrelationIDMiddleware         # sets request_id_ctx, must wrap the log call
SecurityHeadersMiddleware       # outermost
```

Registering `RequestLoggingMiddleware` immediately *before* `CorrelationIDMiddleware`
in the file makes Correlation the outer wrapper, so `request_id_ctx` is still set when
the access line is emitted and `RequestIDFilter` stamps it automatically.

## Sketch

```python
class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Emit one structured access-log line per request."""

    _logger = logging.getLogger("saasconf.access")

    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        status_code = 500
        response = None
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            user = getattr(request.state, "current_user", None)
            route = request.scope.get("route")
            self._logger.info(  # every path logged at INFO, health/metrics included
                "%s %s -> %s (%sms)",
                request.method, request.url.path, status_code, duration_ms,
                extra={
                    "request_id": getattr(request.state, "correlation_id", None),
                    "method": request.method,
                    "path": request.url.path,
                    "route": getattr(route, "path", request.url.path),
                    "status_code": status_code,
                    "duration_ms": duration_ms,
                    "tenant_id": str(user.tenant_id) if user and user.tenant_id else None,
                    "user_id": str(user.user_id) if user else None,
                    "client_ip": _client_ip(request),
                    "response_size": _content_length(response),
                    "user_agent": request.headers.get("user-agent"),
                    "query_keys": sorted(request.query_params.keys()),
                },
            )
```

`_content_length(response)` returns `int(response.headers["content-length"])` when the
header is present and numeric, else `None`.

`_client_ip(request)` is a small helper: first `X-Forwarded-For` hop, stripped, else
`request.client.host`.

## Security

- **No query string values** — `request.url.path` only for `path`, and `query_keys`
  carries parameter **names** only (`sorted(query_params.keys())`). Portal/applicant
  token links and reset flows put secrets in query *values*, never keys, so logging
  names is safe and still tells operators which params were used.
- **No bodies** — only the fixed field set above is logged. `user_agent` is the one
  free-text request header captured; `SensitiveFieldFilter` still runs over the
  formatted message (not the `extra` dict), so keep secrets out of `extra` by design.
- `extra` keys must not collide with `LogRecord` reserved names. `tenant_id`,
  `user_id`, `request_id`, `status_code`, `duration_ms`, `client_ip`, `route`,
  `method`, `path`, `response_size`, `user_agent`, `query_keys` are all safe.

## Edge cases

- **Unhandled exception** — `try/finally` guarantees a line with `status_code=500`
  and a duration; the exception re-raises into the existing `@app.exception_handler`
  chain. Note FastAPI's own exception handlers return a normal `Response` *inside*
  the app, so handled 4xx/5xx already arrive as a response with the right status — the
  `500` default only applies to a genuinely uncaught raise.
- **404 / no matched route** — `request.scope["route"]` is absent; `route` falls back
  to `path`. Still logged.
- **Streaming responses** (`StreamingResponse` exports) — `BaseHTTPMiddleware`
  resolves `status_code` from the response start, so duration reflects time-to-first
  -byte, not full stream drain. Acceptable for an access log; noted so it isn't read
  as total transfer time.
- **Double counting** — Prometheus instrumentation (`Instrumentator`) already records
  latency/counters; this middleware is the *human/aggregator-readable* log, not a
  metrics duplicate. They coexist.

## Dev-sweep impact

- Backend only. New tests in `backend/tests/test_request_logging.py`.
- mypy/ruff over full `app/` tree.
- **No** new endpoint, schema, or response-code change → **no** OpenAPI regeneration
  (`gen:api`) needed. Confirm `pnpm gen:api:check` stays clean.
- No frontend, migration, or handbook changes (logging is not user-visible).
