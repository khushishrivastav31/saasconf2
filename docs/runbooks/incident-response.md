# Incident response

_Last verified: 2026-04-17_
_Status: **advisory** — no production environment exists yet. Adopt and trim as the ops reality materializes._

## What counts as an incident

Declare an incident if **any** of:

- Site is down or degraded for >5 min (5xx rate > 1%, or `/health` failing).
- Customer-visible data loss or corruption (wrong rows returned, cross-tenant leak).
- Suspected unauthorized access (token theft, key compromise, leaked credentials).
- Critical feature broken end-to-end for all tenants (login, registration, invoice PDF).

Sentry error spikes alone are not incidents unless they match one of the above.

## TL;DR (first 10 minutes)

1. **Acknowledge.** Post in the ops channel: _"Incident: <short description>. Investigating."_
2. **Stop the bleed.** Roll back the most recent deploy if timing correlates — see [production-rollback.md](production-rollback.md).
3. **Capture evidence.** Screenshots, timestamps, Sentry links, log excerpts. You will forget details within an hour.
4. **Escalate if needed.** Cannot resolve in 30 min → page a second engineer.
5. **Communicate.** Status update every 20 min even if "still investigating".

## Severity tiers

| Tier | Criteria | Response |
|------|----------|----------|
| **SEV-1** | Full outage, data loss, confirmed security breach | All-hands. No deploys across the org until resolved. Postmortem required. |
| **SEV-2** | Major feature broken, single tenant down, partial data impact | Primary + secondary oncall. Postmortem required. |
| **SEV-3** | Degraded performance, non-critical feature broken | Oncall addresses during business hours. Postmortem optional. |

## Procedure

### 1. Declare + name

Post in the ops channel:

```
🚨 INCIDENT (SEV-X): <one-line symptom>
IC: @<your-handle>
Started: <UTC time>
Investigating.
```

If SEV-1/2, create a Google Doc / shared page titled `YYYY-MM-DD <short-title>` for running notes. Link it in the channel.

### 2. Triage (≤10 min)

Answer in order:

1. **Is it still happening right now?** Check `/health`, `/health/ready`, Sentry event rate.
2. **What changed?** Latest deploy (`git log origin/main`), latest migration (`alembic current`), infra changes (Vercel/Sentry/Resend dashboards).
3. **Who is affected?** One tenant? All tenants? One endpoint? One region?
4. **What is the blast radius if we do nothing for 30 min?**

### 3. Stabilize

Pick the fastest path to stop customer impact, even if it's not the final fix:

- **Recent deploy suspected** → roll back per [production-rollback.md](production-rollback.md).
- **Migration suspected** → downgrade one revision (only if `downgrade()` exists and is safe).
- **Infra/vendor outage** → confirm via the vendor status page; enable any documented fallback path.
- **Bad data / mutation in progress** → freeze writes to the affected tables before restoring (see [restore-from-backup.md](restore-from-backup.md)).
- **Suspected compromise** → rotate the suspected secret per [secret-rotation-execution.md](secret-rotation-execution.md).

### 4. Communicate

Status updates in the ops channel every 20 min, even if "still investigating — no progress". Silence reads as "nobody is on it".

Customer-facing status page (if/when one exists): update within 30 min of SEV-1/2 declaration.

### 5. Resolve

Post once symptoms are gone and monitoring confirms normal state for 15 min:

```
✅ RESOLVED (SEV-X)
Duration: <HH:MM>
Immediate fix: <what stopped the bleed>
Postmortem: <link> (due within 5 business days)
```

### 6. Postmortem (SEV-1 + SEV-2 required, SEV-3 optional)

Write within 5 business days. Short is fine. Template:

```markdown
# Postmortem: <title>

**Date:** YYYY-MM-DD
**Severity:** SEV-X
**Duration:** <HH:MM>
**Author:** <name>

## Summary
<3-5 sentences: what happened, what customers experienced, what fixed it>

## Timeline (UTC)
- HH:MM — <event>
- HH:MM — <event>

## Root cause
<why it broke — technical, not "human error">

## What went well
<detection, response, tooling that helped>

## What went badly
<what made it worse — slow detection, confusing logs, missing runbook>

## Action items
- [ ] <concrete, assignable, with owner + due date>
- [ ] <same>
```

Blameless rule: focus on systems and gaps, not individuals. "X pushed a bad migration" → "the CI migration-check did not catch this class of error".

## Anti-patterns — don't do these

- **Don't investigate before stopping the bleed.** Roll back first, root-cause second.
- **Don't skip the status update because you don't have news.** "Still working on it, next update 14:30 UTC" is a status.
- **Don't write the postmortem as a defense.** If it reads like a legal filing, it's wrong.
- **Don't let action items rot.** Review open postmortem actions monthly; if one has been open 90 days, decide to do it or close it as "won't fix".
- **Don't deploy during an active SEV-1** except to apply the fix itself.
