# Design — Deadline overdue toast fires on every login for stale deadlines

## Frontend — ConferenceDetail/index.tsx

### sessionStorage key schema

```
deadline_toast_shown:<conferenceId>   →  "1"
```

Set immediately before calling `showToast`. Check before computing the
`approaching` list to short-circuit the whole effect.

No TTL or expiry — the entry lives for the browser tab session. A new tab
or a browser restart gives a fresh opportunity to see the toast, which is
acceptable (the admin may have acted in between sessions).

### Staleness filter constant

```ts
const DEADLINE_OVERDUE_CUTOFF_DAYS = 30;
```

Defined at module level so tests can locate it. The filter:

```ts
const diffDays = (due.getTime() - now.getTime()) / 86_400_000;
return d.is_active && diffDays > -DEADLINE_OVERDUE_CUTOFF_DAYS && diffDays <= 7;
```

- `diffDays > -30` → not more than 30 days past due
- `diffDays <= 7` → either already past or within 7 days

### "Mark as resolved" action on overdue toasts

Only for overdue items (`due < now`) when showing individual toasts (≤ 2
approaching). The `showToast` helper currently accepts `(message, type)`.
Extend or overload to accept an optional `action` object:

```ts
showToast(message, 'warning', {
  label: 'Mark as resolved',
  onClick: () => toggleDeadline(d.id),
});
```

`toggleDeadline` calls the existing `PATCH /conferences/{id}/deadlines/{deadlineId}/toggle`
endpoint. On success: invalidate the `deadlines` query so the Deadlines tab
reflects the change, and dismiss the toast.

If `showToast` does not yet support an action, extend it minimally — no
full redesign of the toast system.

### No backend changes

All three fixes are purely frontend. The `toggle` endpoint already exists.
The `list_deadlines` endpoint already returns `is_active` and `due_date`.

## Test cases

| Scenario | Expected |
|----------|----------|
| Session key already set → navigate back to conference | No toast fires |
| Deadline >30 days overdue, `is_active=true` | Toast suppressed; deadline still visible in Deadlines tab |
| Deadline 3 days overdue, `is_active=true` | Toast fires, "Mark as resolved" button visible |
| Deadline 5 days away, `is_active=true` | Toast fires, NO "Mark as resolved" button (not yet overdue) |
| Deadline `is_active=false` | Toast suppressed |
| "Mark as resolved" clicked | `PATCH .../toggle` called; deadline query invalidated; toast dismissed |
| Two overdue deadlines ≤30 days old | Two individual toasts, each with "Mark as resolved" |
| Three+ approaching deadlines | Single summary toast (no action button — action is ambiguous for bundles) |
