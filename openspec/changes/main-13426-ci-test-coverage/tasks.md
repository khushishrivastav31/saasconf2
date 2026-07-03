# MAIN-13426: Tasks

> CI-config-only change. No application code. No OpenAPI drift. No handbook update.

## Gate

- [ ] **STOP after writing this spec folder — wait for user review/approval before
      making any workflow changes.**

## Implementation

- [ ] Add `--cov=app --cov-report=xml` (or per-shard equivalent + combine step) to
      backend test shard jobs; upload per-shard coverage data as artifacts.
- [ ] Add coverage collection to frontend test shard jobs (`vitest run --coverage
      --shard=...`); upload per-shard coverage data as artifacts.
- [ ] Add a `coverage-report` job (depends on all shards) that downloads
      artifacts, merges backend coverage (`coverage combine` + `coverage xml`)
      and frontend coverage, and produces a summary.
- [ ] Wire a PR-comment step (sticky, sourced by a fixed marker) posting the
      merged summary; skip gracefully on forked PRs without write token.
- [ ] Upload merged `coverage.xml`/`lcov.info` as workflow artifacts regardless
      of comment-step success.
- [ ] Decide placement relative to [[main-13425-ci-reusable-workflow]] — prefer
      landing the job inside `_verify.yml` directly.

## Verify

- [ ] Open a throwaway PR and confirm the coverage comment appears with correct
      backend/frontend percentages matching a local `pytest --cov` / `vitest
      --coverage` run.
- [ ] Confirm CI wall-clock time for the test stage does not regress
      meaningfully vs. before this change.
- [ ] Confirm a second push to the same PR updates the existing comment rather
      than adding a new one.

## Ship

- [ ] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit `feat(ci): report merged test coverage on every run
      (MAIN-13426)`; PR per workflow, `--auto --squash` once green.
