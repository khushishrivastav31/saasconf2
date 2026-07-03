# MAIN-13425: CI uses the reusable `_verify.yml` workflow to reduce duplication

## Status
`draft` · Branch: _to be created on approval_ (`chore/ci-verify-reusable-workflow`)

## Methodology
No TDD applicable — this is CI configuration, not application code. Verification is
"the pipeline runs green and produces the same gates," not unit tests.

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

## Proposed Change

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

## Out of Scope

- Adding coverage reporting (that's MAIN-13426).
- Changing `staging.yml` or any deploy pipeline.
- Changing job logic inside `_verify.yml` itself.

## Acceptance Criteria

- `ci.yml` no longer contains inlined copies of lint/test/security-audit/secrets-scan
  jobs; it calls `_verify.yml` via `workflow_call`.
- A PR run of `ci.yml` produces the same set of required status checks as before
  (no check silently disappears from branch protection).
- The `PYSEC-2025-183` ignore exception is present in the merged pipeline.

## Spec

See `openspec/specs/` once implementation lands.
