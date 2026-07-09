# Design — Admin-triggered CFP review seeding

## 1. Shared service extraction

`scripts/seed_cfp_review_data.py::main` currently does three things: resolve the
conference (CLI/interactive), set RLS context, and run the seed. Only the third
is reusable. Extract it:

```python
# app/services/cfp_review_seed.py
@dataclass
class SeedResult:
    papers_created: int
    reviewers_created: int
    assignments_created: int
    reviews_created: int
    must_have_papers: int
    default_password: str  # "Test1234!"

async def seed_cfp_review_data(
    db: AsyncSession,
    conference: Conference,
    *,
    papers: int = 22,
    reviewers: int = 3,
    must_have: int = 5,
) -> SeedResult: ...
```

- Precondition: **`db` is already RLS-scoped to `conference.tenant_id`**. The
  service does not touch RLS context — the caller owns that (CLI sets
  super-admin then tenant scope; the endpoint inherits the request's tenant
  scope). This keeps the security boundary at the caller and avoids a service
  that can silently re-scope a request session.
- The `get_or_create_*` / `create_reviews` / `_compute_review` helpers move into
  the service module (or a shared `_seed_helpers`), imported by the script.
- The script's `main`, `_parse_args`, `_list_conferences`,
  `_select_conference_interactively`, `_confirm`, `_report_state`, and all
  `print` output stay in the script — they are CLI concerns. `main` calls
  `seed_cfp_review_data(...)` and prints from the returned `SeedResult`.
- Idempotency and determinism (`random.Random(conference.id)`) are properties of
  the moved helpers, so they carry over unchanged.

## 2. The environment gate

Production must be unable to run this even if the button leaks. The gate is
**server-side** and closes by default.

- Source of truth: `settings.SENTRY_ENVIRONMENT` (already the env discriminator —
  see `config.py:159`, which treats `production`/`staging` specially). Default is
  `"development"`.
- Define one helper, `is_seeding_allowed(settings) -> bool`, returning
  `settings.SENTRY_ENVIRONMENT.lower() in {"development", "staging"}`. Anything
  else (notably `"production"`, and any unset/unknown value) is **denied** — a
  closed-by-default allow-list, not a `!= "production"` deny-list, so a typo or
  new env name fails safe.
- Endpoint behavior when denied: raise `HTTPException(404)` — same shape as a
  missing route, so production reveals nothing about the feature's existence.

## 3. The endpoint

`app/api/v1/cfp/seed.py`, registered in `app/api/v1/cfp/__init__.py` alongside
the other CFP admin routers.

```
POST /api/v1/cfp/{cfp_id}/seed-review-data
  auth:   TenantAdminDep
  guard:  404 unless is_seeding_allowed(settings)
  body:   { papers?: int, reviewers?: int, must_have?: int }  # bounded, defaults 22/3/5
  200:    SeedReviewDataResponse { papers_created, reviewers_created,
            assignments_created, reviews_created, must_have_papers,
            seeded_account_note }
```

Flow:
1. Guard: `if not is_seeding_allowed(settings): raise HTTPException(404)`.
2. Resolve the CFP by `cfp_id`, then its `Conference`.
3. **Tenant-ownership check**: verify `conference.tenant_id ==
   current_user.tenant_id`. `TenantAdminDep` already scopes the request session's
   RLS to the caller's tenant, so a cross-tenant `cfp_id` won't be found — but we
   assert it explicitly and return `404` on mismatch (defense in depth; never a
   `403` that confirms existence).
4. Call `seed_cfp_review_data(db, conference, ...)` on the request session (which
   is already tenant-scoped), commit, return the summary.

Input bounds (reject absurd volumes): `papers` 1–100, `reviewers` 1–10,
`must_have` 0–`papers`. Enforced via Pydantic `Field(ge=..., le=...)` +
a validator for `must_have <= papers`.

## 4. Exposing the env flag to the frontend

The button should not render in production. **As built:** the frontend already
receives the environment via `import.meta.env.VITE_SENTRY_ENVIRONMENT` (used in
`src/main.tsx`), so a tiny `isSeedEnvironment()` helper mirrors the backend
allow-list client-side — **no backend probe endpoint needed**. This is only
cosmetic; the real gate is the endpoint's own 404.

## As-built notes (diverges from the sketch above)

- **Endpoint is conference-scoped**, not cfp-scoped:
  `POST /api/v1/cfp/conferences/{conference_id}/seed-review-data`. The
  evaluated-papers admin UI works in terms of `conference_id`, and the seed
  service resolves/creates the CFP from a `Conference` anyway, so keying by
  conference avoids an extra frontend fetch. Tenant-ownership is enforced by
  filtering `Conference.tenant_id == current_user.require_tenant_id()`.
- **Button placement**: `SeedTestDataButton` in the Evaluated Papers header
  (`CFPEvaluatedPapers.tsx`) — reachable even in the empty state, which is
  exactly when you want to seed.

## 5. Frontend

- A `SeedTestDataButton` on the conference CFP admin surface (the same area that
  lists papers/reviewers). Guarded by the `available` flag.
- TanStack Query `useMutation` → `POST .../seed-review-data`; on success, toast
  the returned counts and invalidate the papers/reviews queries so the seeded
  rows appear without a reload; on error, toast the message.
- Dark-mode `dark:` variants; `min-h-[44px]` only if it lands on a portal
  surface (this is an admin surface, so desktop-first is fine).
- Confirmation dialog before firing (it writes 20+ rows), mirroring the CLI's
  `_confirm` prompt.

## 6. Security review checkpoints

- Closed-by-default env gate, server-side, `404` on deny.
- `TenantAdminDep` + explicit tenant-ownership assertion; no cross-tenant reach.
- Seeded accounts remain CFP applicants/committee members only
  (`portal_user_id` null) — **no auth users, no outbound email**. Preserve this
  invariant from increment 1; add a test asserting no `User`/portal rows are
  created.
- Bounded inputs prevent a tenant admin from seeding tens of thousands of rows.
- Read `.claude/docs/security.md` before writing the endpoint (new privileged
  write surface).

## 7. OpenAPI drift

New endpoint(s) + response schema → **OpenAPI will drift**. Run
`pnpm gen:api` and commit `frontend/src/types/api.generated.ts`.
