# Design — Deadline icon tooltips

## Approach

1. Find the existing tooltip primitive (most likely a `Tooltip`
   component or the `title=""` HTML attribute).
2. Wrap each status icon with the tooltip, supplying a status label.

## Status label mapping

```ts
const STATUS_LABELS: Record<DeadlineStatus, string> = {
  upcoming: 'Upcoming',
  due_today: 'Due today',
  past_due: 'Past due',
  submitted: 'Submitted',
  cancelled: 'Cancelled',
};
```

Adjust to match the actual statuses present in `types/deadline.ts`.

## Rendering

```tsx
<Tooltip content={STATUS_LABELS[deadline.status]}>
  <StatusIcon status={deadline.status} />
</Tooltip>
```

If no `Tooltip` component exists, fall back to native `title`:

```tsx
<span title={STATUS_LABELS[deadline.status]}>
  <StatusIcon ... />
</span>
```

## Test Impact

| File | Change |
|------|--------|
| `DeadlinesTab.test.tsx` (extend) | Each status icon has an accessible tooltip / `title` matching its status label |
