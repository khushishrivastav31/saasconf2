# MAIN-13425: Design

> **Implementation note:** the target state and migration steps below describe
> the original full-convergence design. It was not implemented as-is — see
> "Scope revision" in `proposal.md` for why (branch-protection required-check
> names change on every job when a workflow switches to `uses:`, and neither
> the author nor the assistant had permission to update them). What actually
> shipped in this PR is the smaller Option B fix: composite-action reuse +
> the `PYSEC-2025-183` fix, with job names/IDs untouched. The "Target state"
> below remains the intended end state for a follow-up ticket once branch
> protection can be coordinated.

## Current state

```
ci.yml (PR trigger)          staging.yml (deploy trigger)
├─ backend-lint (inline)      └─ uses: ./.github/workflows/_verify.yml
├─ backend-test-shard x4              (backend-lint, test shards, gate,
├─ backend-tests (gate)                slow-tests, frontend-lint/build,
├─ backend-slow-tests                  test shards, gate, schema-drift,
├─ frontend-lint/build                 security-audit, secrets-scan)
├─ frontend-test-shard x3     -> then deploy steps
├─ frontend-tests (gate)
├─ schema-drift
├─ security-audit  (ignore list missing PYSEC-2025-183)
└─ secrets-scan
```

`ci.yml` re-implements every job `_verify.yml` already has, using raw
`actions/setup-python`/`actions/setup-node` instead of the composite actions.

## Target state

```
ci.yml (PR trigger)
└─ uses: ./.github/workflows/_verify.yml   (same inputs staging.yml passes)

staging.yml (deploy trigger)
└─ uses: ./.github/workflows/_verify.yml   (unchanged)
```

Both entry points converge on one job definition. Future CI changes (new lint
rule, new test shard, new security check) are made once in `_verify.yml` and
apply to both PR and staging runs automatically.

## Migration steps

1. Diff `ci.yml`'s per-job `env`/`with` inputs against `_verify.yml`'s
   `workflow_call.inputs`/`secrets` block — add any missing input to
   `_verify.yml` so nothing `ci.yml` currently sets gets silently dropped.
2. Replace the job list in `ci.yml` with the single `uses:` call, keeping
   `ci.yml`'s trigger (`on: pull_request`) and any PR-only concurrency group
   settings.
3. Update branch protection required-checks list if job names change (reusable
   workflow jobs are namespaced as `<job>` under the calling workflow — verify
   names match what branch protection currently expects, or update the
   protection rule).
4. Remove the now-dead inline job definitions from `ci.yml`.

## Risk

- Branch protection required-status-check names are matched by string; if the
  job names produced by the reusable workflow differ from `ci.yml`'s current
  job names, PRs could get stuck "waiting for status" until protection rules
  are updated. Treat updating branch protection as part of this change, not a
  follow-up.
- **This risk materialized during implementation.** Confirmed via a real
  `staging.yml` run: reusable-workflow-call jobs report as `<calling job
  name> / <job name>` (e.g. `Verify / Backend Lint & Type Check`), not the
  bare job name. Every one of `ci.yml`'s ~8 required checks would be renamed
  simultaneously on merge. Both `/branches/main/protection` and `/rulesets`
  returned 404 for the available `gh` token (no admin access), so the
  required-checks list could not be safely updated in lockstep. Full
  convergence is deferred to a follow-up ticket with a GitHub admin looped
  in; this PR ships Option B instead (see `proposal.md`).
