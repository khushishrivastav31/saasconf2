# 0005. Pydantic v2 strict mode

- **Status:** Accepted
- **Date:** 2026-04-17
- **Deciders:** @josediaz
- **Tags:** backend, api, data-validation

## Context

FastAPI uses Pydantic as its request/response validation layer. Pydantic has two eras:

- **v1** — the long-standing API with `class Config:` inner classes, `validator`/`root_validator` decorators, loose type coercion by default.
- **v2** — complete rewrite with a Rust-based core (`pydantic-core`), `ConfigDict` in place of `class Config`, `field_validator`/`model_validator`, stricter type handling, and measurable speedups.

Additional choice inside v2: **lax** vs **strict** mode. Lax mode coerces inputs (`"123"` → `123`, `"true"` → `True`); strict mode rejects them.

Constraints at decision time:
- SaaSConf's API is consumed by an internal frontend — type mismatches are fixable immediately, not a backwards-compat nightmare.
- The audit and a prior security review flagged loose validation as a footgun: `"false"` coerced to `True` once caused a tenant to think a conference was inactive when it was actually public.
- Our schemas are the source of truth for OpenAPI type generation on the frontend (audit step 24) — permissive schemas erode type safety downstream.
- Performance matters: Pydantic v1 was a measurable bottleneck for large list responses.

## Decision

Use **Pydantic v2 with `ConfigDict(from_attributes=True)`** on all API schemas, and **treat lax coercion as a bug** in new code. Legacy v1-style `class Config:` blocks are migrated on sight, not left dual-style. Strict validators are preferred over lax ones when the choice is ambiguous — e.g. use `bool` with no string coercion for explicit booleans, `int` without `str` input allowed for numeric IDs.

The project convention (already documented in `CLAUDE.md`):

```python
class FooCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    is_active: bool = True
```

No `class Config:` blocks anywhere. No `Config = ConfigDict(...)` — the attribute must be `model_config`.

## Consequences

- **Positive:**
  - Significant perf win over v1 (Rust core) — list endpoints and streaming exports are faster.
  - Type coercion bugs become impossible in strict mode; the API contract matches the schema.
  - OpenAPI output is precise, enabling faithful frontend type generation (`openapi-typescript`).
  - One idiom everywhere — faster onboarding, simpler code review.
- **Negative:**
  - No dual-library coexistence with v1; a dependency pinned to Pydantic v1 forces a fork or an upstream PR.
  - Some migration points still surface: validators that silently coerced in v1 now reject inputs; minor breakage when adopting third-party libraries whose models are still v1-style.
  - Error messages are more verbose (and more precise). Clients that log the full error object will see bigger payloads.
- **Neutral / note:**
  - `from_attributes=True` is the v2 equivalent of v1's `orm_mode = True`. Required to consume ORM instances directly without a `.dict()` step.
  - Custom validators use the v2 decorators: `field_validator("x")` instead of `validator("x")`; `model_validator(mode="after")` instead of `root_validator(...)`. Do not mix.

## Alternatives considered

- **Pydantic v1:** stable and familiar, but measurably slower and missing the stricter typing. Rejected — migration cost was a one-time hit that paid off immediately.
- **Marshmallow / attrs + custom FastAPI integration:** more flexible but loses FastAPI's automatic OpenAPI generation and the out-of-the-box DX. Rejected — we'd rebuild features we got for free.
- **Dataclasses + manual validation:** minimal, but every endpoint reimplements the same patterns. Rejected.

## References

- `backend/app/schemas/` — all Pydantic schemas using v2 conventions.
- `CLAUDE.md` — "Pydantic v2 — `model_config = ConfigDict(from_attributes=True)`. No legacy `class Config:`."
- `docs/backend.md` — schema patterns and conventions.
- `docs/audit-report-2026-04.md` — step 24 (OpenAPI type generation depends on strict schemas).
