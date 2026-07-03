# MAIN-13444: Tasks

> Dev-tooling script, not application behavior. No OpenAPI drift, no handbook
> update (not user-facing). A smoke test + manual verification substitute for
> full RED/GREEN/REFACTOR.

## Gate

- [ ] **STOP after writing this spec folder — wait for user review/approval
      before writing any script code.**

## Build

- [ ] `backend/scripts/seed_cfp_review_data.py` following the structure in
      `design.md`, patterned after `seed_papers_from_csv.py`.
- [ ] `get_or_create_*` helpers for session types, reviewers, papers,
      assignments, reviews — idempotent by natural key.
- [ ] Must-have distribution: exactly 5 of the seeded evaluated papers get
      `must_have=True` on at least one review.
- [ ] CLI argument for target conference id/slug; scoped strictly to that
      conference's tenant.

## Verify

- [ ] Run the script locally against a dev conference; confirm ≥20 evaluated
      papers, 3 reviewers, correct must-have count via direct DB query.
- [ ] Re-run the script against the same conference; confirm no duplicate rows
      created (idempotency).
- [ ] Confirm no rows created outside the target tenant (spot-check another
      tenant's data untouched).
- [ ] `venv/bin/python -m mypy app/ --config-file=pyproject.toml` (script
      likely lives under `backend/scripts/`, confirm it's in mypy's scope or
      excluded consistently with sibling scripts).
- [ ] `ruff check app/` (or whatever scope covers `scripts/`) clean.

## Ship

- [ ] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit `chore(cfp): add seed script for review test data
      (MAIN-13444)`; PR per workflow, `--auto --squash` once green.
