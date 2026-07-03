# MAIN-13426: Tasks

> CI-config-only change. No application code. No OpenAPI drift. No handbook update.

## Gate

- [ ] **STOP after writing this spec folder — wait for user review/approval before
      making any workflow changes.**

## Implementation

> **Placement decision (revised 2026-07-03):** add all coverage plumbing directly
> to `ci.yml`. Do NOT migrate `ci.yml` onto `_verify.yml` — that renames every PR
> check and would freeze merges against opaque required-check config. See design.md.

- [ ] Backend shards: add `--cov=app --cov-report=` (data only, no report) so each
      shard writes a `.coverage` data file; upload it as a per-shard artifact.
      Use `COVERAGE_FILE=.coverage.${{ matrix.shard }}` so files don't collide on
      merge.
- [ ] Frontend shards: add `vitest run --coverage --shard=...` writing the v8
      `coverage-final.json`; upload per-shard as an artifact.
- [ ] Add a `coverage-report` job (`needs:` both shard matrices, `if: always()`)
      that downloads all artifacts, runs `coverage combine` + `coverage xml`/
      `report` for backend and `nyc merge` (istanbul) + summary for frontend,
      writes both percentages to `$GITHUB_STEP_SUMMARY`.
- [ ] Wire a sticky PR comment (fixed `<!-- coverage-report -->` marker via
      `marocchino/sticky-pull-request-comment`) posting the merged summary; guard
      the comment step so forked PRs without a write token skip gracefully.
- [ ] Upload merged `coverage.xml` + `lcov.info` as workflow artifacts regardless
      of comment-step success.

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
