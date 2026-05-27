# Tasks — Sidebar lists existing conferences

## Methodology: TDD (Red → Green → Refactor)

## Phase 0 — Recon

- [ ] Find the current sidebar component (`AppSidebar.tsx`, `Sidebar.tsx`,
      or similar). Confirm where the "Conferences" nav item is rendered.
- [ ] Confirm `GET /conferences` returns the shape we need (id + name).

## Phase 1 — Render

### RED
- [ ] Write test: sidebar renders 2 conference nav items when API returns
      2 conferences. Expect failure (nothing renders today).

### GREEN
- [ ] Add the TanStack Query + render nested `<NavLink>` items.
- [ ] Run test → green.

### REFACTOR
- [ ] Extract the conference-list block into a small subcomponent if
      `AppSidebar.tsx` grows past its line budget.

## Phase 2 — Active highlight

### RED
- [ ] Test: when URL is `/modules/conferences/conf-1`, the nav link for
      `conf-1` has an `aria-current="page"` (or active CSS class).

### GREEN
- [ ] Use `useLocation()` (or `NavLink`'s built-in active state) to mark
      the current conference.

## Phase 3 — Invalidate on create

### RED
- [ ] Test: creating a conference triggers a refetch of the sidebar query.

### GREEN
- [ ] Add `queryClient.invalidateQueries({ queryKey: ['sidebar-conferences'] })`
      to the create mutation's `onSuccess`.

## Phase 4 — Full sweep

- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] Manual: create a new conference → confirm it appears in the sidebar
      without a page reload.
