# 0003. Redis-backed slowapi rate limiter

- **Status:** Accepted
- **Date:** 2026-04-17
- **Deciders:** @josediaz
- **Tags:** security, infrastructure, performance

## Context

Rate limiting is a required defense-in-depth layer for the SaaSConf API: login brute-force, password-reset abuse, expensive exports and PDF generation, and noisy tenants sharing an upstream proxy IP all need a backstop.

Two questions drive the design:

1. **Where are counters stored?** In-process (e.g. `slowapi` default, `limits` in-memory, dict) vs external (Redis, Memcached, DB).
2. **What is the limiter key?** IP-only, authenticated-user, tenant, or a composite.

Constraints at decision time:
- Backend can run as multiple processes or containers (staging + prod). An in-process limiter would reset counters per worker, effectively multiplying the budget by `worker_count` and making the limit meaningless.
- Redis is already in the stack for token blacklisting and session caching.
- `slowapi` is the FastAPI-idiomatic wrapper around `limits`, which supports pluggable storage.
- Tenants and corporate customers sometimes share upstream proxy IPs — IP-only limits risk punishing all colocated tenants when one misbehaves.

## Decision

Use **`slowapi` with Redis storage** as the rate-limit backend. Expose two limiter instances:

- `limiter` — keyed by client IP. For unauthenticated endpoints (login, password reset, portal signup).
- `tenant_limiter` — keyed by `<tenant_id>:<ip>` when the request is authenticated, falling back to IP-only otherwise. For expensive authenticated work (exports, PDF generation, bulk writes).

Both share the same Redis instance so counters are coherent across workers. Limits are env-configurable (`RATE_LIMIT_LOGIN`, `RATE_LIMIT_API`, etc.).

## Consequences

- **Positive:**
  - Horizontal scaling just works — N workers share one counter per key.
  - Reusing existing Redis: no new infrastructure.
  - Tenant-aware key means one noisy tenant cannot exhaust the budget for peers behind the same NAT.
  - Limits are declarative (decorators on endpoints) and easy to audit.
- **Negative:**
  - Redis becomes part of the hot path for rate-limited endpoints — a Redis outage either fails open (no limiting) or fails closed (no requests), neither ideal. `slowapi` defaults to fail-open; we accept that and monitor Redis uptime.
  - Counters are approximate under race conditions — fine for rate limiting but not safe as a billing counter.
  - Per-tenant budgets need careful tuning: what is "expensive" differs per endpoint. One global budget is too blunt.
- **Neutral / note:**
  - Rate limiting is **defense in depth**, not the primary auth. Login still has per-account lockout (audit step 3 / `auth.py`) on top of the IP limit.
  - In the test suite `RATELIMIT_ENABLED=false` — do not rely on rate limits being exercised by unit tests.

## Alternatives considered

- **In-process limiter (`slowapi` default memory storage):** correct for a single-worker deploy; meaningless with horizontal scaling. Rejected.
- **Nginx rate limiting (`limit_req_zone`):** works at the edge, but cannot see tenant context (that's inside the JWT) and cannot share state across multiple edge nodes without extra plumbing. Kept as a coarse secondary layer.
- **Dedicated Postgres counter table:** would survive a Redis outage but adds DB write pressure on every request. Rejected on performance grounds.
- **Cloudflare / CDN rate limiting:** useful but orthogonal — doesn't protect against a logged-in tenant hammering an internal endpoint.

## References

- `backend/app/core/rate_limiter.py` — limiter instances and key functions.
- `backend/app/api/v1/auth.py` — login limit usage.
- `docs/audit-report-2026-04.md` — step 16 (per-tenant rate limiting).
- `docs/devops.md` — rate-limit configuration reference.
