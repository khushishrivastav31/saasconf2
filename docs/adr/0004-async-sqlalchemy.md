# 0004. Async SQLAlchemy throughout

- **Status:** Accepted
- **Date:** 2026-04-17
- **Deciders:** @josediaz
- **Tags:** backend, database, performance

## Context

FastAPI is an async framework. The question is whether the ORM and database driver should also be async, or whether sync SQLAlchemy (with `run_in_threadpool`) is acceptable.

Considerations at decision time:
- Mixing sync DB calls inside an async event loop blocks the loop — one slow query starves every other in-flight request on the same worker.
- `asyncio.to_thread` / `run_in_threadpool` can bridge sync DB calls, but it pays thread-context-switch cost per query and makes transaction semantics harder to reason about.
- SQLAlchemy 2.x has first-class async support (`AsyncSession`, `create_async_engine`) that mirrors the sync API closely.
- `asyncpg` is measurably faster than `psycopg2` for bulk query patterns.
- Streaming large exports (CSV, invoices) via `StreamingResponse` + async generators requires an async DB cursor.

Constraints:
- Tests must work with the same ORM config as production — a dual sync/async codebase doubles the test surface.
- Some libraries (WeasyPrint for PDFs, PyMuPDF) are inherently synchronous — those need `asyncio.to_thread` regardless.

## Decision

Use **async SQLAlchemy + asyncpg end-to-end**. Everything touching the DB is an `async def` function returning through `AsyncSession`. Blocking third-party libraries (PDF rendering, image processing) are wrapped with `asyncio.to_thread(...)` so they don't block the event loop.

Connection pooling uses the defaults (`pool_size=10`, `max_overflow=20` — see `backend/app/config.py`). Tests use `NullPool` to avoid the asyncpg "attached to a different loop" error across event loops.

## Consequences

- **Positive:**
  - One concurrency model across the whole backend — no sync/async mixing bugs.
  - Streaming endpoints are cheap: async generators yield DB rows without materializing the result set.
  - Higher throughput per worker: a single process handles many concurrent slow queries without blocking.
  - `asyncpg` is faster than sync drivers for our workloads.
- **Negative:**
  - Every new code path must be `async def`; library authors unfamiliar with async sometimes write blocking calls by accident (`time.sleep`, `requests.get`) — code review needs to catch these.
  - Stack traces cross event-loop boundaries and are harder to read than sync traces.
  - Debugging requires `await`-aware tooling; `breakpoint()` inside async code works but not everyone remembers.
  - Test fixture setup is more intricate — see `backend/tests/conftest.py` (NullPool, `asyncio.run` in a session-scoped sync fixture, etc.).
- **Neutral / note:**
  - **Hard rule:** never call a sync blocking operation in request-path code. Use `asyncio.to_thread` for WeasyPrint, `anyio.to_thread.run_sync` for `cryptography` operations if they become hot, etc.
  - Pagination is mandatory for list endpoints (see `CLAUDE.md`) — async does not rescue an O(N) full-table scan.

## Alternatives considered

- **Sync SQLAlchemy inside FastAPI:** works, but blocks the event loop on long queries. Rejected — the whole point of FastAPI is concurrent I/O.
- **Sync ORM + worker processes per request:** pre-fork model like Flask+gunicorn. Rejected; horizontal scaling costs more than async in-process concurrency for our traffic profile.
- **Raw asyncpg (no ORM):** fastest, but loses relationship loading, query caching, and the migration tooling we get from SQLAlchemy. Rejected — we're not bandwidth-bound on DB driver overhead.

## References

- `backend/app/db/session.py` — async engine + session factory.
- `backend/tests/conftest.py` — test engine config (NullPool, event-loop handling).
- `CLAUDE.md` — performance rules including "async I/O — never block the event loop".
- `docs/backend.md` — async patterns in practice.
