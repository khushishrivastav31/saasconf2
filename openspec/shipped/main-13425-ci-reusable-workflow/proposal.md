# MAIN-13425: CI uses the reusable `_verify.yml` workflow to reduce duplication

## Status
`in-progress` · Branch: `chore/ci-verify-reusable-workflow`

## Methodology
No TDD applicable — this is CI configuration, not application code. Verification is
"the pipeline runs green and produces the same gates," not unit tests.

## Scope revision (implementation-time)

The original proposal below called for collapsing `ci.yml` into a single
`uses: ./.github/workflows/_verify.yml` call, mirroring `staging.yml`. During
implementation this turned out to have a blocking side effect: GitHub Actions
prefixes every check name produced by a reusable-workflow call with the
calling job's name (confirmed empirically from a `staging.yml` run — checks
report as `Verify / Backend Lint & Type Check`, not `Backend Lint & Type
Check`). `ci.yml`'s checks are required status checks on `main`'s branch
protection; renaming all of them in the same PR that merges them would leave
every subsequent PR stuck "waiting for status" until an admin updates the
required-checks list to the new names. Neither the author nor the assistant
had permission to view or update branch protection (`/branches/main/protection`
and `/rulesets` both 404 for the `gh` token in use), so that coordination
couldn't happen safely within this change.

**Implemented instead (Option B):** point `ci.yml`'s existing inline jobs at
the same composite actions `_verify.yml` already uses
(`./.github/actions/setup-backend`, `./.github/actions/setup-frontend`) and
carry over the `PYSEC-2025-183` ignore-vuln exception — fixing the concrete
drift bug from issue #309 without changing any job name or ID. The full
convergence to a single `uses:` call (this proposal's original scope) is
deferred to a follow-up ticket once someone with GitHub admin access can
coordinate the branch-protection required-checks update in lockstep with the
merge.

## Problem

GitHub issue #309. `.github/workflows/_verify.yml` already exists as a reusable
`workflow_call` workflow (backend lint/mypy, sharded backend tests + gate, slow
tests, frontend lint/build, sharded frontend tests + gate, schema-drift, security
audit, secrets scan) and `staging.yml:29-31` already calls it via
`uses: ./.github/workflows/_verify.yml`. But `ci.yml` (the workflow that actually
gates PRs) does **not** call it — every job is duplicated inline instead, including
using raw setup steps rather than the `./.github/actions/setup-backend` and
`./.github/actions/setup-frontend` composite actions that `_verify.yml` already
uses.

This duplication has already caused drift: `ci.yml`'s security-audit ignore list
(ci.yml:390) is missing the `PYSEC-2025-183` exception present in
`_verify.yml:281-282` — a live example of the exact problem this ticket exists to
prevent.

## Proposed Change (original scope — deferred, see above)

1. Replace `ci.yml`'s inlined jobs (lint, backend test shards + gate, slow tests,
   frontend lint/build, frontend test shards + gate, schema-drift, security-audit,
   secrets-scan — `ci.yml:29-431`) with a single `uses: ./.github/workflows/_verify.yml`
   call, mirroring `staging.yml:29-31`.
2. Reconcile the `PYSEC-2025-183` ignore-list drift as part of the migration (the
   merged workflow gets `_verify.yml`'s ignore list, which is the more current one).
3. Confirm `_verify.yml`'s `workflow_call` inputs/secrets cover everything `ci.yml`
   currently passes (env vars, secrets, matrix parameters) so no job silently loses
   a required input.
4. Do not change `_verify.yml`'s internal job logic — this ticket is about
   eliminating the duplicate copy in `ci.yml`, not changing what CI checks.

## Implemented Change (Option B — this PR)

1. `ci.yml`'s `backend-lint`, `backend-test-shard`, `frontend-lint`,
   `frontend-test-shard`, and `schema-drift` jobs now use
   `./.github/actions/setup-backend` / `./.github/actions/setup-frontend`
   instead of raw inline setup steps — the same composite actions `_verify.yml`
   already uses. Job names/IDs are unchanged.
2. `security-audit`'s `pip-audit` call gains the `--ignore-vuln PYSEC-2025-183`
   exception, matching `_verify.yml`. `security-audit` deliberately keeps its
   raw Python/Node setup (not the composite actions) — same reasoning as
   `_verify.yml`: `pnpm audit` never runs `pnpm install`, so the composite
   action's pnpm cache step would fail with "Path Validation Error".
3. No job names, IDs, or check-run identities changed — branch protection's
   required-checks list needs no update for this PR.

## Out of Scope

- Adding coverage reporting (that's MAIN-13426).
- Changing `staging.yml` or any deploy pipeline.
- Changing job logic inside `_verify.yml` itself.
- The full `uses: ./.github/workflows/_verify.yml` convergence (deferred —
  needs branch-protection coordination with a GitHub admin; track as a
  follow-up ticket).

## Acceptance Criteria

- `ci.yml`'s setup steps for lint/test/schema-drift jobs delegate to
  `./.github/actions/setup-backend` / `./.github/actions/setup-frontend`
  instead of duplicating raw setup steps.
- The `PYSEC-2025-183` ignore exception is present in `ci.yml`'s
  `security-audit` job.
- No required status check name changes — a PR run of `ci.yml` produces the
  same set of check names as before.

## Spec

See `openspec/specs/` once implementation lands.
