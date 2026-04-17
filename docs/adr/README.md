# Architecture Decision Records (ADRs)

An ADR captures **one significant architectural decision**: what was decided, why, and what the consequences are. It exists so that six months later, when someone asks *"why do we use RLS instead of schema-per-tenant?"*, the answer is one click away — not buried in a Slack thread or lost in a departed engineer's memory.

## When to write an ADR

Write one when the decision:
- **Changes the shape of the system** (auth model, tenancy strategy, ORM choice, deployment topology).
- **Will be hard to reverse later** — the cost of revisiting grows over time.
- **Was contested** — if two reasonable engineers would pick differently, capture which path was taken and why.

Do **not** write an ADR for: library bumps, refactors, cosmetic choices, or anything covered by `docs/best-practices.md`.

## Format

Use [0000-template.md](0000-template.md). Number ADRs sequentially — once an ADR is merged, its number and title are fixed. Never delete or rewrite a superseded ADR; instead write a new one marked `Supersedes 00NN`, and flip the old one's `Status` to `Superseded by 00MM`.

## Catalog

| # | Title | Status |
|---|-------|--------|
| [0001](0001-row-level-security-for-multi-tenancy.md) | Row-Level Security for multi-tenancy | Accepted |
| [0002](0002-jwt-hs256-over-rs256.md) | JWT HS256 over RS256 | Accepted |
| [0003](0003-redis-backed-rate-limiter.md) | Redis-backed slowapi rate limiter | Accepted |
| [0004](0004-async-sqlalchemy.md) | Async SQLAlchemy throughout | Accepted |
| [0005](0005-pydantic-v2-strict.md) | Pydantic v2 strict mode | Accepted |
