# Design — Self-Role Modification Guard

## Self-Detection

The currently-authenticated user's ID is available from the auth context
(e.g. `useAuthUser()` or `AuthContext`). The target user's ID is available
from the member row being edited.

Compare `authUser.id === targetUser.id` in the role-editing component.

---

## Frontend Changes

### Role-editing component (wherever `PATCH /users/{id}/roles` is triggered)

Identify the exact component — likely one of:
- `frontend/src/pages/ConferenceDetail/tabs/settings/UserRolesTab.tsx`
- A member list page that renders inline role controls
- A user detail / edit modal

Changes:
1. Import the current user from auth context.
2. Where role checkboxes / selects / buttons are rendered:
   - If `currentUser.id === member.id`: wrap controls in `disabled` state +
     render an inline notice:
     ```
     You cannot modify your own roles.
     ```
     Style as `text-xs text-amber-600 dark:text-amber-400` with a lock icon.
3. The save/submit button for that row should also be disabled when
   `isSelf === true`.

### `onError` hardening

In the mutation that calls `PATCH /users/{id}/roles`:
```ts
onError: (error) => {
  showToast(parseApiError(error, 'Failed to update roles'), 'error');
}
```

This ensures any server-side validation error (including the self-guard) is
surfaced as a readable toast even if the frontend guard is bypassed.

---

## Test Impact

| File | Change |
|------|--------|
| New or updated test for the role-editing component | When `currentUser.id === member.id`, role controls are disabled and notice is visible |
| Same test | When `currentUser.id !== member.id`, controls are enabled normally |

---

## Rollout / Risk

- Pure frontend change; no backend migration.
- The `disabled` state must be accessible (not just visually muted) — use
  HTML `disabled` attributes on inputs, not just CSS opacity.
