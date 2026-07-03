# MAIN-13426: Design

## Why merging shard coverage, not an extra unsharded run

Tests are already sharded (backend x4, frontend x3) purely for wall-clock time.
Running an additional full unsharded pass just to get a coverage number would
roughly double CI time for the test stage. Instead:

- Each shard runs with coverage enabled and uploads its raw data
  (`.coverage.<shard>` for pytest-cov, per-shard v8 json for vitest) as a
  build artifact.
- A new lightweight `coverage-report` job, depending on all shards, downloads
  the artifacts, merges them (`coverage combine` + `coverage xml`/`report` for
  Python; a vitest/istanbul merge step for JS), and produces the final numbers.

## Sequencing with MAIN-13425

[[main-13425-ci-reusable-workflow]] moves `ci.yml` onto `_verify.yml`. This
change's coverage job should be added *inside* `_verify.yml` so it's inherited
by both `ci.yml` and `staging.yml` once 13425 lands — landing coverage before
13425 finishes means duplicating the coverage job in both `ci.yml` and
`_verify.yml` temporarily. Recommend landing 13425 first, or coordinating so
this change's coverage job is authored directly against `_verify.yml`.

## PR comment mechanics

- Use a stable comment identifier (e.g. `<!-- coverage-report -->` marker) so
  the bot updates one comment across pushes instead of spamming the PR thread.
- Comment content: backend %, frontend %, delta vs. base branch if the chosen
  action supports it, link to the full HTML/artifact report.
- On forked-PR runs (no write token), skip the comment step gracefully and
  rely on the artifact upload — don't fail the job over a permissions gap.

## Coverage config already in place (no changes needed here)

- Backend: `backend/pyproject.toml:185-196` (`fail_under = 55`, exclusions).
- Frontend: `frontend/vite.config.ts:17-41` (`thresholds.statements: 60`,
  `lines: 61`, reporters already include `json-summary` which many PR-comment
  actions consume directly).
