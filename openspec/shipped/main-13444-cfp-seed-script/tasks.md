# MAIN-13444: Tasks

> Dev-tooling script, not application behavior. No OpenAPI drift, no handbook
> update (not user-facing). A smoke test + manual verification substitute for
> full RED/GREEN/REFACTOR.

## Gate

- [x] **STOP after writing this spec folder — wait for user review/approval
      before writing any script code.**

## Build

- [x] `backend/scripts/seed_cfp_review_data.py` following the structure in
      `design.md`, patterned after `seed_papers_from_csv.py`.
- [x] `get_or_create_*` helpers for session types, reviewers, papers,
      assignments, reviews — idempotent by natural key.
- [x] Must-have distribution: exactly 5 of the seeded evaluated papers get
      `must_have=True` on at least one review.
- [x] CLI argument for target conference id/slug; scoped strictly to that
      conference's tenant. Also supports an interactive picker (numbered list +
      confirmation) when `--conference-id` is omitted; `--yes` skips the prompt.
- [x] Seeded applicants use `<prefix>-test-saasconf@yopmail.com` addresses (so a
      real throwaway inbox can receive mail) with password `Test1234!`.

## Verify

- [x] Run the script locally against a dev conference; confirm ≥20 evaluated
      papers, 3 reviewers, correct must-have count via direct DB query.
      (22 papers, 3 seeded reviewers, 5 must-have papers, 6 scored answers/review.)
- [x] Re-run the script against the same conference; confirm no duplicate rows
      created (idempotency). (Second/third runs create 0 rows.)
- [x] Confirm no rows created outside the target tenant — writes run with
      `set_rls_context(tenant_id=..., is_super_admin=False)`, so RLS rejects any
      cross-tenant write. (Local DB has a single tenant, so enforcement is by
      RLS scoping rather than a cross-tenant spot-check.)
- [x] `venv/bin/python -m mypy app/ --config-file=pyproject.toml` — clean (740
      files). Script also mypy-clean; it lives under `backend/scripts/`, outside
      the sweep's `app/` scope, consistent with sibling scripts.
- [x] `ruff check` / `ruff format --check` clean for both `app/` and the script.

## Ship

- [x] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit `chore(cfp): add seed script for review test data
      (MAIN-13444)`; PR per workflow, `--auto --squash` once green.
