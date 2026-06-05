# Tasks — Deadline overdue toast fires on every login for stale deadlines

## Phase 0 — Recon

- [ ] Confirm `showToast` signature in the toast utility — check whether it
      already supports an action/button param or needs a minimal extension.
- [ ] Confirm `PATCH .../toggle` returns the updated `Deadline` payload so
      the query invalidation strategy is clear.

## Phase 1 — sessionStorage "shown" state

### RED
- [ ] Test: navigating away and back to a conference does not re-fire the
      toast when `sessionStorage` key is already set for that conference.
- [ ] Test: a different conference in the same session shows its own toast
      (keys are per-conference).

### GREEN
- [ ] Replace `deadlineToastShownRef` with `sessionStorage.getItem` /
      `sessionStorage.setItem` keyed by conference ID in
      `ConferenceDetail/index.tsx`.

### REFACTOR
- [ ] Extract the sessionStorage key builder into a one-line helper const.

## Phase 2 — Staleness filter (30-day cutoff)

### RED
- [ ] Test: deadline 31 days overdue + `is_active=true` → NO toast.
- [ ] Test: deadline 29 days overdue + `is_active=true` → toast fires.
- [ ] Test: deadline 3 days from now + `is_active=true` → toast fires.
- [ ] Test: Deadlines tab still renders the 31-day-overdue deadline (filter
      must NOT affect the tab rendering, only the toast).

### GREEN
- [ ] Add `DEADLINE_OVERDUE_CUTOFF_DAYS = 30` constant.
- [ ] Update the `approaching` filter in `useEffect` to include the cutoff.

## Phase 3 — "Mark as resolved" action on overdue toasts

### RED
- [ ] Test: overdue deadline toast renders a "Mark as resolved" button.
- [ ] Test: approaching (not yet overdue) deadline toast has NO action button.
- [ ] Test: clicking "Mark as resolved" calls the toggle endpoint.
- [ ] Test: after toggle, the deadlines query is invalidated.
- [ ] Test: summary toast (3+ deadlines) shows no action button.

### GREEN
- [ ] Extend `showToast` with optional `action: { label: string; onClick: () => void }`.
- [ ] Pass the action for overdue single-deadline toasts.
- [ ] Call `queryClient.invalidateQueries` on the deadlines key after toggle.

### REFACTOR
- [ ] Ensure the toast action renders consistently in light and dark mode.

## Phase 4 — Full sweep + manual

- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] Manual: Create two deadline records — one 35 days past due, one 3 days
      past due. Load conference page → confirm only the 3-day-overdue toast
      appears → navigate away and back → confirm NO toast → click "Mark as
      resolved" → confirm deadline tab shows it as resolved.
