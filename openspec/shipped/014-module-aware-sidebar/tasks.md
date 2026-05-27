# Tasks — Module-aware sidebar navigation

## Methodology: TDD (Red → Green → Refactor)

## Phase 0 — Recon

- [ ] Find the sidebar component file.
- [ ] Confirm `useAuth()` exposes `currentUser.modules` and
      `currentUser.is_super_admin`.
- [ ] Map each existing sidebar nav item to its module code.

## Phase 1 — Filter top-level items

### RED
- [ ] Test: a user with `modules: ['conferences']` does NOT see the
      Trainings nav link.
- [ ] Test: a user with `modules: ['trainings']` does NOT see the
      Conferences nav link.
- [ ] Test: a super admin sees both.

### GREEN
- [ ] Add `hasModule(code)` helper inside the sidebar.
- [ ] Wrap each top-level module link with the helper.

### REFACTOR
- [ ] If multiple components repeat the pattern, lift `hasModule` to the
      auth hook.

## Phase 2 — Sub-items

- [ ] Apply the same filter to nested items (e.g. "Trainers" under
      Trainings).

## Phase 3 — Full sweep

- [ ] `pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `pnpm test`
- [ ] Manual: log in as a Conferences-only user → confirm no Trainings
      link.
- [ ] Manual: log in as a Trainings-only user → confirm no Conferences
      link.
