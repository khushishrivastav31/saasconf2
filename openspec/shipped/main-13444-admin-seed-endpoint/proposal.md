# MAIN-13444 (increment 2): Admin-triggered CFP review seeding at staging

## Status
`shipped` · Branch: `fix/reviewer-video-download-hyperlink` (existing — no new branch)

## Methodology
Standard Red-Green-Refactor. The seed logic already exists and is verified
(shipped in increment 1); this increment adds an HTTP surface and an
environment gate, both of which are ordinary application behavior and get
real tests (RED first): env-gate 404s, auth, and a happy-path seed.

## Problem

The CFP review seed script (`backend/scripts/seed_cfp_review_data.py`, shipped
under `openspec/shipped/main-13444-cfp-seed-script/`) can only be run from a
shell with DB access. Testing the evaluated-papers workflows on **staging**
therefore requires SSH / a console session — the tenant admins who actually
want to demo and QA these flows can't trigger it themselves.

The ask (same ticket, MAIN-13444): let a **tenant admin** seed review test data
into their own conference from the admin UI on staging, without shell access.

## Goals

- A tenant admin can seed CFP review test data into a conference they administer,
  from the conference admin UI.
- The action is **inert in production**: the endpoint returns `404` and the
  button is not rendered there.
- Zero duplication of seeding logic — the CLI and the endpoint call one shared
  service.
- Idempotent and tenant-scoped, exactly as the CLI is today.

## Non-goals

- **No "remove seed data" / cleanup action** in this increment (deferred; the
  `-test-saasconf` tag makes it cheap to add later).
- No super-admin cross-tenant seeding via the UI — the endpoint seeds only the
  caller's own tenant/conference.
- No production enablement under any flag.
- No change to the CLI's behavior or interface.

## Approach (summary)

1. **Extract** the orchestration in `scripts/seed_cfp_review_data.py::main`
   (the block from `get_or_create_cfp` through `create_reviews` + `commit`) into
   a reusable service `app/services/cfp_review_seed.py::seed_cfp_review_data(...)`
   that takes an already-RLS-scoped `AsyncSession`. The script imports and calls
   it, keeping its CLI/interactive/`--list` shell untouched.
2. **Add** a tenant-admin endpoint `POST /api/v1/cfp/{cfp_id}/seed-review-data`
   (new `app/api/v1/cfp/seed.py`) that:
   - is guarded by `TenantAdminDep`;
   - returns `404` unless `settings.SENTRY_ENVIRONMENT` is a non-production env
     (`development` / `staging`) — the gate is server-side, not just UI;
   - resolves the CFP → conference, verifies it belongs to the caller's tenant,
     and calls the shared service under the request's tenant RLS context;
   - returns a summary (counts + seeded-account note).
3. **Frontend**: a "Seed test data" button on the conference CFP admin surface,
   rendered only when a small `GET`-exposed env flag says the environment is
   non-production, wired through TanStack Query with a success/error toast.

See `design.md` for the gate mechanism, the tenant-ownership check, and the
env-exposure decision.
