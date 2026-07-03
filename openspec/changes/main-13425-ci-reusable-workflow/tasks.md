# MAIN-13425: Tasks

> CI-config-only change. No application code, no tests to write (RED/GREEN/REFACTOR
> doesn't apply). No OpenAPI drift. No handbook update.

## Gate

- [ ] **STOP after writing this spec folder — wait for user review/approval before
      making any workflow changes.**

## Implementation

- [ ] Diff `ci.yml` vs `_verify.yml` inputs/secrets; add anything missing to
      `_verify.yml`'s `workflow_call` block.
- [ ] Replace `ci.yml`'s inlined jobs with `uses: ./.github/workflows/_verify.yml`.
- [ ] Carry over the `PYSEC-2025-183` ignore exception (currently only in
      `_verify.yml`) so the merged pipeline keeps it.
- [ ] Check GitHub branch protection required-checks list against the new job
      names produced by the reusable workflow; update if they differ.

## Verify

- [ ] Push a throwaway PR (or use `act`/workflow dry-run if available) and confirm
      all the same checks run and pass as before the change.
- [ ] Confirm the PR is not stuck waiting on a stale required-check name.

## Ship

- [ ] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit `chore(ci): migrate ci.yml to reusable _verify.yml
      workflow (MAIN-13425)`; PR per workflow, `--auto --squash` once green.
