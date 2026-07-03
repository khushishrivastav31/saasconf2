# MAIN-13426: CI reports test coverage on every run

## Status
`draft` · Branch: _to be created on approval_ (`feat/ci-coverage-reporting`)

## Methodology
No TDD applicable — CI configuration change. Verified by inspecting the produced
PR comment/artifact, not by application tests.

## Problem

GitHub issue #295. Both stacks are already instrumented for coverage but nothing
runs or publishes it:

- Backend: `pytest-cov` is installed (`backend/pyproject.toml:66`,
  `backend/requirements.txt:15,68`) and `[tool.coverage.run]`/`[tool.coverage.report]`
  is configured with `fail_under = 55` (`backend/pyproject.toml:185-196`) — but no
  workflow step passes `--cov` to pytest.
- Frontend: `vite.config.ts:17-41` has a full v8 coverage block (text/lcov/json-summary
  reporters, `thresholds.statements: 60`, `lines: 61`) and `package.json:17` has a
  `test:coverage` script — but `ci.yml`/`_verify.yml` frontend-test-shard steps run
  plain `vitest run --shard=...`, and a comment at `ci.yml:260-262` notes coverage
  is deliberately skipped per-shard.
- `staging.yml:27` has a comment claiming "Staging opts into coverage collection;
  CI does not" but no coverage step actually exists in `staging.yml` either — the
  comment is aspirational/stale.
- Nothing uploads a coverage artifact or posts a PR comment anywhere in the repo.

## Proposed Change

1. **Backend**: run the full (non-sharded, or merged-across-shards) suite with
   `--cov=app --cov-report=xml --cov-report=term` in one place — either a dedicated
   coverage job or by merging shard-level `.coverage` data files with
   `coverage combine` before reporting, to avoid re-running the whole suite twice.
2. **Frontend**: same merge-across-shards approach — accumulate v8 coverage per
   shard and merge (`nyc merge` or vitest's own multi-shard coverage merge) rather
   than running an unsharded pass, to keep CI wall-clock time flat.
3. **Publish**: post a single PR comment summarizing both backend and frontend
   coverage (a sticky comment via `marocchino/sticky-pull-request-comment` fed by
   generated summaries, or `py-cov-action/python-coverage-comment-action` for
   Python + `davelosert/vitest-coverage-report-action` for the frontend, combined
   into one comment if feasible — final tool choice is an implementation decision,
   not fixed here).
4. Upload the raw coverage reports (`coverage.xml`, `lcov.info`) as workflow
   artifacts regardless of PR-comment tooling, so trend data survives even if the
   comment step is skipped (e.g. on forked-PR runs without write permissions).
5. Do **not** fail the build on coverage drop in this change — this ticket is about
   *visibility*, not gating. A follow-up ticket can turn `fail_under`/`thresholds`
   into a hard CI gate once the reporting is trusted.

## Out of Scope

- Enforcing coverage thresholds as a merge-blocking check (separate ticket if
  wanted later — the config already has numbers in place: 55% backend, 60/61%
  frontend, but this change publishes, it doesn't gate).
- Migrating `ci.yml` to call `_verify.yml` (MAIN-13425 — sequence that first or in
  parallel; this change should land its coverage step inside `_verify.yml` so both
  tickets converge cleanly rather than conflict).

## Acceptance Criteria

- Every CI run of `_verify.yml` (via `ci.yml` or `staging.yml`) produces a merged
  coverage number for backend and for frontend.
- A PR gets a coverage summary comment (or updated sticky comment on re-runs, not
  a new comment every push).
- Coverage reports are available as downloadable workflow artifacts.
- Existing test jobs' wall-clock time does not regress meaningfully (no duplicate
  full-suite run just to compute coverage).

## Spec

See `openspec/specs/` once implementation lands.
