# MAIN-13443: Tasks

> Frontend-primary change; backend sort work only if list endpoint is
> paginated (confirm during implementation). OpenAPI regen only if a
> `sort_by` query param is added to `/cfp/papers`. User-visible → handbook
> update required.

## Gate

- [x] **Reviewed/approved by user (2026-07-03).** Scope confirmed:
      `CFPEvaluatedPapers.tsx` only — `PaperDetailModal.tsx` is out of scope.

## RED — tests first

Frontend (`frontend/src/pages/modules/cfp/__tests__/CFPEvaluatedPapers.test.tsx`
or sibling):
- [ ] Sorting by Session Type orders the list correctly, both directions.
- [ ] Sorting by average score orders correctly, both directions, with
      unscored papers placed consistently (not interleaved as `0`).
- [ ] Expanded paper card shows `learning_objectives`, `video_url`,
      `custom_field_answers`.

Backend (only if server-side sort is needed — confirm pagination first):
- [ ] `GET /cfp/papers?sort_by=session_type|average_score` returns correctly
      ordered results.
- [ ] Run and confirm frontend tests fail for the right reason (no sort
      control exists yet).

## GREEN — implementation

- [ ] Confirm client-side vs. server-side sort need (check pagination on
      current endpoint).
- [ ] Add sort controls to `CFPEvaluatedPapers.tsx`.
- [ ] If server-side needed: add `sort_by` param + query logic to
      `papers.py`'s list endpoint (subquery-based average score per
      `design.md`).
- [ ] Add missing fields (`learning_objectives`, `video_url`,
      `custom_field_answers`) to `EvaluatedPaperCard`, reusing reviewer-view
      sub-components where they exist.
- [ ] Re-run targeted tests → green.

## REFACTOR

- [ ] If a shared "full paper detail" block emerges (used by both admin and
      reviewer views), consider extracting it — but only if it doesn't force
      an awkward abstraction across the two different permission contexts.

## Verify (full sweep)

- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `pnpm test`
- [ ] If backend touched: `venv/bin/python -m pytest tests/ -k cfp_papers -v`,
      `mypy app/`, `ruff check app/ && ruff format --check app/`, full
      `pytest tests/ -n 4 -q`.
- [ ] If `sort_by` param added: `pnpm gen:api` + `pnpm gen:api:check` clean.
- [ ] Update `frontend/src/pages/Handbook/handbookSections.tsx`.

## Ship

- [ ] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit `feat(cfp): sort evaluated papers and show full
      detail in admin view (MAIN-13443)`; PR per workflow, `--auto --squash`
      once green.
