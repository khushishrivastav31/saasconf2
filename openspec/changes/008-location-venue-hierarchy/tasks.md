# Tasks — Location Venue Hierarchy

## Methodology: TDD (Red → Green → Refactor)

## Status Legend
- `[ ]` not started
- `[~]` in progress
- `[x]` done

---

## Phase 1 — Correct top-level list

### RED
- [ ] Write `frontend/src/__tests__/ConferenceDetail/LocationsTab.test.tsx`
  - Fixture: venue A (no parent), room B (parent_id = A), room C (parent_id = A)
  - Assert: only venue A appears in the top-level list
  - Assert: rooms B and C do NOT appear as top-level items
  - Assert: rooms B and C appear as children under venue A
  - Run → **expect failure**: all three show at top level (or rooms are hidden)

### GREEN
- [ ] In `LocationsTab.tsx`, replace iteration over `items` with iteration
  over `parentLocations` for the main list render
- [ ] For each parent, render child rows from `childrenByParent.get(loc.id)`
  with indentation (`pl-8` or similar)
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Extract `VenueRow` and `RoomRow` sub-components for cleaner JSX

---

## Phase 2 — Expand/collapse toggle

### RED
- [ ] Extend the test:
  - Initially all venues are expanded (child rooms visible)
  - Clicking a venue's toggle button hides its child rooms
  - Clicking again re-shows them
  - Run → **expect failure**: toggle does not exist

### GREEN
- [ ] Add `expandedVenues` state (`Set<string>`, default includes all venue IDs)
- [ ] Add chevron toggle button per venue row; toggle the venue ID in/out of `expandedVenues`
- [ ] Conditionally render child rows based on expansion state
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Ensure keyboard accessibility for the toggle (Enter/Space on the button)

---

## Phase 3 — Orphaned room warning

### RED
- [ ] Extend the test:
  - Fixture: room D with `parent_id = 'missing-id'` (orphaned)
  - Assert: room D appears in an "Orphaned rooms" section
  - Assert: room D does NOT appear in any venue's child list
  - Run → **expect failure**: orphan handling logic not in place

### GREEN
- [ ] Render `orphanedLocations` (computed from existing logic at line 259)
  in a separate section with a warning badge
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Add a warning notice explaining that orphaned rooms lost their parent venue

---

## Phase 4 — Full sweep

- [ ] `cd frontend && pnpm exec tsc --noEmit`
- [ ] `cd frontend && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] Manual: create a venue + rooms → confirm rooms appear indented under venue
- [ ] Manual: confirm `main_hall` room no longer appears in the top-level list
- [ ] Manual: expand/collapse toggle works
