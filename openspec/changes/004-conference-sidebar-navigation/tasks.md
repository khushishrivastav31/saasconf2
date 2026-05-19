# Tasks — Conference Sidebar Navigation

## Methodology: TDD (Red → Green → Refactor)

## Status Legend
- `[ ]` not started
- `[~]` in progress
- `[x]` done

---

## Phase 1 — ConferenceSidebarSection component

### RED
- [ ] Write `frontend/src/__tests__/layout/ConferenceSidebarSection.test.tsx`
  - Renders conference name in the sidebar
  - Renders sub-links for Overview, CFP, Registration, Program, Sponsors,
    Communications, Insights, Settings
  - Active sub-link receives highlight class when `activeSection` matches
  - Run → **expect failure**: component does not exist

### GREEN
- [ ] Create `frontend/src/components/layout/ConferenceSidebarSection.tsx`
  - Accept `{ conference, activeSection }` props
  - Render name heading + 8 sub-links with correct `?section=` href params
  - Apply active highlight using Tailwind classes matching existing sidebar pattern
  - Dark-mode variants (`dark:` prefix on all color classes)
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Ensure name truncation (max 24 chars + ellipsis) works correctly
- [ ] Extract `CONFERENCE_SIDEBAR_SECTIONS` constant to `conferenceSidebarSections.ts`

---

## Phase 2 — AdminLayout integration

### RED
- [ ] Write `frontend/src/__tests__/layout/AdminLayout.conferenceNav.test.tsx`
  - When route is `/modules/conferences/:id/...`, sidebar renders `ConferenceSidebarSection`
  - When route is `/modules/conferences` (list), no `ConferenceSidebarSection` is rendered
  - When route is `/modules/conferences/:id/...`, the conference name displayed matches the conference fixture
  - Run → **expect failure**: AdminLayout does not render ConferenceSidebarSection

### GREEN
- [ ] In `AdminLayout.tsx`:
  - Add `useMatch('/modules/conferences/:conferenceId/*')` to detect active conference
  - When matched: render `<ConferenceSidebarSection conference={...} activeSection={section} />`
    below the static "Conferences" link
  - Derive `activeSection` from `URLSearchParams` (`?section=`)
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm the match pattern handles both `?section=` params and nested routes cleanly

---

## Phase 3 — Collapsed "recent" entry (no active conference)

### RED
- [ ] Extend `AdminLayout.conferenceNav.test.tsx`:
  - When route is NOT a conference detail but at least one conference exists,
    a collapsed "Recent" conference entry appears
  - The entry links to the most-recently-updated conference (first in list)
  - Run → **expect failure**: feature not implemented

### GREEN
- [ ] In `AdminLayout.tsx`: add collapsed entry when `!conferenceId && conferences.length > 0`
  - Show `conferences[0]` name + "↩" icon or similar
  - Link to `/modules/conferences/${conferences[0].id}`
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Verify truncation and dark-mode styling matches ConferenceSidebarSection

---

## Phase 4 — Full sweep

- [ ] `cd frontend && pnpm exec tsc --noEmit`
- [ ] `cd frontend && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] Manual: create a conference → confirm it appears in sidebar
- [ ] Manual: navigate into conference → confirm sub-links highlight correctly
- [ ] Manual: navigate away → confirm "recent" entry persists in sidebar
