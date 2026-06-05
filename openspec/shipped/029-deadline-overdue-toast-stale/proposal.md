# Change 029 — Deadline overdue toast fires on every login for stale deadlines

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

After an admin updates a CFP close date (or any conference date), a toast
notification for "Overdue: 'CFP Submission Deadline' is due 29.3.2026" keeps
appearing on every page load — even weeks after the underlying date has been
changed to a future value.

Root causes (three, independent but compounding):

1. **Deadlines are standalone records, not linked to CFP/conference dates.**
   `Deadline` rows in the `deadlines` table are manually created in the
   Deadlines tab. Updating the CFP `close_date` field does NOT update any
   corresponding `Deadline` record. The two data sources diverge silently.

2. **The toast fires on every page mount.**
   `deadlineToastShownRef` in `ConferenceDetail/index.tsx` is a `useRef`,
   so it resets whenever the component unmounts (navigation away and back,
   or a new login). Every mount re-runs the effect and re-fires the toast.
   There is no session-level or user-level "seen" state.

3. **There is no dismiss or resolve action on the toast itself.**
   The only way to silence the notification is to navigate to the Deadlines
   tab, find the record, and toggle it to "resolved". This is invisible to
   most admins who interpret the notification as stale noise and click
   dismiss without knowing the underlying record still exists.

## Proposed Change

### 1 — Per-session "shown" state (sessionStorage)

Replace `useRef` with `sessionStorage` keyed by conference ID.

```
sessionStorage.getItem(`deadline_toast_shown:${conferenceId}`)
```

Once a toast fires for a given conference in a session it will not fire
again — even after navigating away and returning — until the browser tab is
closed. This eliminates the "every login" re-fire.

### 2 — Staleness filter: skip deadlines overdue by >30 days

In the frontend toast filter, exclude deadlines whose `due_date` is more
than 30 days in the past. A deadline that old was already shown and either
ignored or the admin is aware. Showing it repeatedly is noise.

The Deadlines tab itself continues to show all overdue deadlines regardless
of age — the filter only affects the toast.

```ts
const MAX_OVERDUE_DAYS = 30;
const approaching = deadlineData.items.filter((d) => {
  if (!d.is_active) return false;
  const due = new Date(d.due_date);
  const diffDays = (due.getTime() - now.getTime()) / 86_400_000;
  return diffDays > -MAX_OVERDUE_DAYS && diffDays <= 7;
});
```

### 3 — "Mark as resolved" action on the overdue toast

When a single overdue deadline is toasted (i.e. `approaching.length <= 2`
and the deadline is past due), include an action button: **Mark as resolved**.
Clicking it calls `PATCH /conferences/{id}/deadlines/{deadlineId}/toggle`
and dismisses the toast. This closes the loop without requiring navigation.

This action only appears for overdue deadlines, not for approaching-but-not-yet-due
ones (those should stay active until they pass or are acted on).

## Out of Scope

- Automatically linking `Deadline` records to CFP/conference date fields
  (that is a larger schema change — see future spec).
- Global notification inbox or unread-count badge.
- Per-user persistent dismiss (localStorage or server-side) — session-level
  is sufficient for the reported UX issue.

## Affected files

| File | Change |
|------|--------|
| `frontend/src/pages/ConferenceDetail/index.tsx` | Replace `useRef` with `sessionStorage`; add 30-day staleness filter; add "Mark as resolved" button on overdue toasts |
| `frontend/src/pages/ConferenceDetail/index.test.tsx` (extend or new) | Unit tests for the three behaviours |
