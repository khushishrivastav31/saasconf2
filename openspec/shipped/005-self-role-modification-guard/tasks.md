# Tasks — Self-Role Modification Guard

## Methodology: TDD (Red → Green → Refactor)

## Status Legend
- `[ ]` not started
- `[~]` in progress
- `[x]` done

---

## Phase 0 — Locate role-editing surface

- [ ] Identify the exact component(s) where `PATCH /users/{id}/roles` is
  triggered (search for `roles` mutation + `/users/` in frontend src)
- [ ] Document the component path(s) in a comment at the top of this file

---

## Phase 1 — Self-guard UI

### RED
- [ ] Write or extend test for the role-editing component:
  - When `authUser.id === member.id`, role controls render as `disabled`
  - When `authUser.id === member.id`, an inline notice "You cannot modify
    your own roles" is visible
  - When `authUser.id !== member.id`, controls are enabled
  - Run → **expect failure**: no guard exists yet

### GREEN
- [ ] In the role-editing component:
  - Read `currentUser` from auth context
  - Compute `const isSelf = currentUser?.id === member.id`
  - Pass `disabled={isSelf}` to role controls (checkboxes / selects)
  - Render notice when `isSelf` is true
  - Disable save/submit button when `isSelf` is true
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm `disabled` propagates to all control variants (add, remove, bulk)

---

## Phase 2 — Error handler hardening

### RED
- [ ] Write test: when the role mutation fails with a 422 containing
  `"Cannot modify your own roles"`, a toast is shown with that message
  - Run → **expect failure** if `onError` currently swallows the error

### GREEN
- [ ] Add/update `onError` on the role mutation:
  ```ts
  onError: (error) => {
    showToast(parseApiError(error, 'Failed to update roles'), 'error');
  }
  ```
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm other mutations in the same component also have proper `onError` handlers

---

## Phase 3 — Full sweep

- [ ] `cd frontend && pnpm exec tsc --noEmit`
- [ ] `cd frontend && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] Manual: log in as tenant admin → open team members → try to edit own roles
  → confirm controls are disabled and notice is shown
