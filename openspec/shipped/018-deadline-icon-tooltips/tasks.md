# Tasks — Deadline icon tooltips

## Phase 0 — Recon

- [ ] Locate the existing tooltip primitive (`Tooltip` component or
      native `title=""`).
- [ ] Enumerate the deadline statuses used in `DeadlinesTab.tsx`.

## Phase 1 — Wrap status icons

### RED
- [ ] Test: each rendered deadline has an accessible tooltip whose text
      matches the deadline's status label.

### GREEN
- [ ] Add the tooltip wrapper around each status icon.

### REFACTOR
- [ ] Extract `STATUS_LABELS` to a small constant inside the file
      (avoid scattering label strings throughout JSX).

## Phase 2 — Full sweep

- [ ] `pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `pnpm test`
- [ ] Manual: hover each deadline icon → confirm tooltip text appears
      and matches the visible status.
