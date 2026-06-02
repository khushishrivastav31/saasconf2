# Tasks — Sticky Actions Column + Horizontal Table Scroll

## Phase 0 — Recon

- [ ] Grep frontend for all components that render an ACTIONS column or
      action icon buttons in table rows.
- [ ] Determine whether a shared table/DataTable wrapper component exists.
- [ ] Check current `overflow` CSS on table container `<div>` elements.
- [ ] List all affected files — update this file before Phase 1.

## Phase 1 — Shared component (if exists)

### RED
- [ ] Test: table wrapper has `overflow-x-auto` class.
- [ ] Test: ACTIONS `<th>` and `<td>` have `sticky right-0` classes.
- [ ] Test: sticky cells carry light + dark background classes.
- [ ] Confirm tests fail before any implementation.

### GREEN
- [ ] Add `overflow-x-auto` to the shared table wrapper.
- [ ] Add `sticky right-0 bg-white dark:bg-gray-900` (or equivalent) to
      the ACTIONS column header and data cells.
- [ ] Add left border / shadow separator to sticky column.

### REFACTOR
- [ ] Verify no duplicate className overrides across per-table usages.

## Phase 2 — Per-table fixes (tables without a shared component)

For each hand-rolled table identified in Phase 0, repeat the RED → GREEN
cycle:

- [ ] Session Types table
- [ ] Location Types table
- [ ] Sponsor Packages table
- [ ] User Roles table
- [ ] Volunteer Tasks table
- [ ] Committee Roles table
- [ ] Registration Questions table
- [ ] Speakers table
- [ ] Attendees table
- [ ] Badges table
- [ ] Invoices table
- [ ] Program Committee table
- [ ] Deadlines table
- [ ] (add others found during recon)

## Phase 3 — Dark mode verification

- [ ] Toggle dark mode and scroll each table — confirm sticky cells do not
      show bleed-through from scrolled columns.

## Phase 4 — Full sweep

- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] Manual: open Session Types with both sidebars expanded — ACTIONS
      column must be visible and functional without collapsing anything.
- [ ] Manual: scroll the table body left — confirm middle columns scroll
      and ACTIONS stays pinned.
