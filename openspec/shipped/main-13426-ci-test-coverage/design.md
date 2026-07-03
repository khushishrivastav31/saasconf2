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

**Status update (verified 2026-07-03):** MAIN-13425 landed (commit `8c1cab0`) but
only extracted the composite `setup-backend`/`setup-frontend` actions. It did
**not** move `ci.yml` onto `_verify.yml`. Current reality:

- `_verify.yml` exists and is called **only by `staging.yml`**.
- `ci.yml` (the PR gate) still defines its **own inline** `backend-test-shard` /
  `frontend-test-shard` jobs and does not call `_verify.yml`.
- The header comment in `_verify.yml` claiming it is "called by ci.yml (PRs) and
  staging.yml" is stale/aspirational.

**Decision (revised 2026-07-03): add coverage directly to `ci.yml`; do NOT
migrate `ci.yml` onto `_verify.yml` in this change.**

Rationale — the migration was investigated and rejected as too risky for this
ticket's scope:

- PR checks are currently reported with **bare job names** (`Backend Tests`,
  `Frontend Tests`, `Detect Changes`, `OpenAPI schema drift`, …).
- Calling `_verify.yml` from a `verify:` job renames every check to
  `Verify / <job name>` (GitHub always prefixes reusable-workflow checks with the
  caller job name).
- The repo enforces **required status checks** against the bare names (the
  `Detect Changes` stub in `ci.yml` exists solely to satisfy one). Those are
  configured at a level not readable via the API (`branches/main/protection` and
  `rulesets` both 404). Renaming the checks would leave the required checks
  pending forever and **freeze all PR merges** until an admin re-points them.

Since this ticket is about *coverage visibility*, not a workflow refactor, we add
the coverage plumbing to `ci.yml` directly and leave the `ci.yml` ↔ `_verify.yml`
consolidation to a dedicated future ticket that can coordinate the required-check
rename with a repo admin. `staging.yml` (via `_verify.yml`) does not get the
coverage comment; that is acceptable — PRs are where coverage visibility matters.

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
