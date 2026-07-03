# MAIN-13425: Tasks

> CI-config-only change. No application code, no tests to write (RED/GREEN/REFACTOR
> doesn't apply). No OpenAPI drift. No handbook update.

## Gate

- [x] **STOP after writing this spec folder — wait for user review/approval before
      making any workflow changes.** (approved 2026-07-03; scope revised to
      Option B during implementation — see `proposal.md`.)

## Implementation (original, full convergence — deferred)

- [ ] Diff `ci.yml` vs `_verify.yml` inputs/secrets; add anything missing to
      `_verify.yml`'s `workflow_call` block.
- [ ] Replace `ci.yml`'s inlined jobs with `uses: ./.github/workflows/_verify.yml`.
- [ ] Check GitHub branch protection required-checks list against the new job
      names produced by the reusable workflow; update if they differ. **Blocked:
      needs a GitHub admin — the required-checks list could not be read or
      updated with the available access.**

## Implementation (Option B — shipped this PR)

- [x] Point `backend-lint`, `backend-test-shard`, `frontend-lint`,
      `frontend-test-shard`, `schema-drift` at `./.github/actions/setup-backend`
      / `./.github/actions/setup-frontend` instead of inline setup steps.
- [x] Carry over the `PYSEC-2025-183` ignore exception into `ci.yml`'s
      `security-audit` job (previously only in `_verify.yml`).
- [x] Confirm no job names/IDs changed (branch protection untouched).

## Verify

- [ ] Push the PR and confirm all the same checks run and pass as before the
      change (same check names, no new "waiting for status").

## Ship

- [ ] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit `fix(ci): reuse setup-backend/setup-frontend
      composite actions in ci.yml, fix PYSEC-2025-183 ignore drift
      (MAIN-13425)`; PR per workflow, `--auto --squash` once green.
- [ ] Open a follow-up ticket for the deferred full `_verify.yml` convergence,
      requiring GitHub admin coordination on branch protection.
