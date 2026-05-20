# Tasks — Location Venue Hierarchy

## Methodology: TDD (Red → Green → Refactor)

## Status Legend
- `[ ]` not started
- `[~]` in progress
- `[x]` done

---

## Phase 1 — Correct top-level list

### RED
- [x] Write `frontend/src/__tests__/ConferenceDetail/LocationsTab.test.tsx`
  - Fixture: venue A (no parent), room B (parent_id = A), room C (parent_id = A)
  - Assert: only venue A appears in the top-level list
  - Assert: rooms B and C do NOT appear as top-level items
  - Assert: rooms B and C appear as children under venue A
  - Run → **expect failure**: all three show at top level (or rooms are hidden)

### GREEN
- [x] In `LocationsTab.tsx`, replace iteration over `items` with iteration
  over `parentLocations` for the main list render
- [x] For each parent, render child rows from `childrenByParent.get(loc.id)`
  with indentation (`pl-7` or similar)
- [x] Run tests → **expect green**

### REFACTOR
- [x] Extract `VenueRow` and `RoomRow` sub-components for cleaner JSX

---

## Phase 2 — Expand/collapse toggle

### RED
- [x] Extend the test:
  - Initially all venues are expanded (child rooms visible)
  - Clicking a venue's toggle button hides its child rooms
  - Clicking again re-shows them
  - Run → **expect failure**: toggle does not exist

### GREEN
- [x] Add `collapsedVenues` state (`Set<string>`, default empty = all expanded)
- [x] Add chevron toggle button per venue row; toggle the venue ID in/out of `collapsedVenues`
- [x] Conditionally render child rows based on expansion state
- [x] Run tests → **expect green**

### REFACTOR
- [x] Keyboard accessibility handled via native `<button>` (Enter/Space work by default)

---

## Phase 3 — Orphaned room warning

### RED
- [x] Extend the test:
  - Fixture: room D with `parent_id = 'missing-id'` (orphaned)
  - Assert: room D appears in an "Orphaned rooms" section
  - Assert: room D does NOT appear in any venue's child list
  - Run → **expect failure**: orphan handling logic not in place

### GREEN
- [x] Compute `orphanedLocations` (items with parent_id but parent not found)
- [x] Render orphaned locations in a separate section with a warning badge
- [x] Remove orphaned items from `locationTree` (they were previously at level 0)
- [x] Run tests → **expect green**

### REFACTOR
- [x] Added warning notice explaining that orphaned rooms lost their parent venue

---

## Phase 4 — Full sweep

- [x] `cd frontend && pnpm exec tsc --noEmit`
- [x] `cd frontend && pnpm exec eslint src/`
- [x] `cd frontend && pnpm test`
- [x] Updated handbook entry (eventSetup.tsx section 1-6-locations)
- [ ] Manual: create a venue + rooms → confirm rooms appear indented under venue
- [ ] Manual: confirm `main_hall` room no longer appears in the top-level list
- [ ] Manual: expand/collapse toggle works
