# Runbooks

Step-by-step procedures for ops tasks. Runbooks answer *"how do I do X right now, at 3am, while the site is on fire?"* — optimized for copy-paste execution, not narrative reading.

A runbook belongs here if it meets **all** of:

1. It's a **procedure**, not a concept (concepts live in `docs/architecture.md`, `docs/infrastructure.md`, etc.).
2. It's **executable end-to-end** from the page — no `TODO: figure out the exact command` gaps.
3. It's **operational** — ie. something you'd run against a live environment, not local dev.

## Catalog

| Runbook | Purpose | When to use |
|---------|---------|-------------|
| [release-tagging.md](release-tagging.md) | Cut a new `vX.Y.Z` tag + GitHub release | Before every production deploy |
| [production-deploy.md](production-deploy.md) | Deploy code to production | Every production release |
| [production-rollback.md](production-rollback.md) | Roll back a bad production deploy | When the latest deploy broke something |
| [incident-response.md](incident-response.md) | Triage / escalate / postmortem a production incident | During and after an outage |
| [restore-from-backup.md](restore-from-backup.md) | Restore the production DB from S3 backup | Data corruption / accidental destructive query |
| [secret-rotation-execution.md](secret-rotation-execution.md) | Execute a secret rotation (companion to `../secret-rotation.md` policy) | Scheduled rotation or suspected secret leak |
| [sentry-alerts.md](sentry-alerts.md) | Reference for configured Sentry alert rules + expected responses | Receiving a Sentry page |
| [rls-policy-verification.md](rls-policy-verification.md) | Verify every tenant-scoped table has RLS enabled + a policy | After a schema change; periodic audit |

## Writing a new runbook

- **Start with the 30-second summary.** The reader may be stressed.
- **Prefer copy-pasteable blocks.** Inline the command; don't link out.
- **Include failure-case branches.** "If X happens, do Y" beats "make sure X doesn't happen."
- **Name the human who should act.** `oncall` is fine if the team uses that term; "someone" is not.
- **Date the last-verified-correct entry** so stale runbooks are obvious.
