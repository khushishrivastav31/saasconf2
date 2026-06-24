# MAIN-13389: Tasks

## 0 — Verify root cause (before any code)

- [ ] Inspect the staging `session_types` row backing "Masterclass (6 hours)" for the
      reported paper: confirm `is_active` / `cfp_eligible`.
  - If **not** (active && cfp_eligible) → proceed with the validity-filter fix below.
  - If it **is** (active && cfp_eligible) → stop and revisit (see design.md,
    "Alternative root cause"): data fix and/or add `validate_session_type` to the
    portal create/update write paths.

## 1 — RED (backend tests first)

- [ ] `tests/test_cfp_portal_assigned_papers.py` (or existing reviewer test file):
      paper linked to a non-(active+cfp_eligible) session type → assigned-papers
      response has `session_type_name is None`. Confirm it fails today.
- [ ] Regression test: paper linked to a valid (active + cfp_eligible) type →
      `session_type_name` still resolves.
- [ ] Edge test: `session_type_id is None` → `session_type_name is None`.
- [ ] Mirror the above for the management list + single paper endpoints
      (`app/api/v1/cfp/shared.py` consumers).

## 2 — GREEN (implementation)

- [ ] `_build_assigned_paper_response` (`cfp_portal/papers/_helpers.py` ~429): add
      `is_active` + `cfp_eligible` to the `SessionType` lookup.
- [ ] single-paper resolver (`_helpers.py` ~242): same predicate.
- [ ] `_load_paper_list_context` (`_helpers.py` ~142): same predicate on the batched
      `IN (...)` lookup.
- [ ] `shared.py` batched `session_type_map` builder (~282): same predicate.
- [ ] `shared.py` single-paper resolver (~561): same predicate.
- [ ] (Optional, per review decision) extract a shared
      `resolve_session_type_name(s)` helper and call it from all sites.

## 3 — REFACTOR / sweep

- [ ] `cd backend && venv/bin/python -m pytest tests/test_cfp_portal*.py tests/test_cfp*.py -v`
- [ ] `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `cd backend && ruff check app/ && ruff format --check app/`
- [ ] Full sweep: `cd backend && venv/bin/python -m pytest tests/ -n 4 -q`

## 4 — OpenAPI

- [ ] No endpoint/request/response shape change → no `pnpm gen:api` run needed.
      (Confirm with `cd frontend && pnpm gen:api:check` printing no output.)

## 5 — Ship

- [ ] Move `openspec/changes/main-13389-reviewer-session-type-display/` →
      `openspec/shipped/` in the same PR.
