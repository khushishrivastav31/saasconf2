# Change 005 — Self-Role Modification Guard

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 0.5.1.8: A user is able to modify their own roles from the admin UI. The
backend (`app/api/v1/users.py` line 671) does guard against this and raises a
`ValidationError("Cannot modify your own roles")`, but the frontend does not
prevent the attempt or surface the error clearly.

Two problems:
1. The role-editing UI for the currently-logged-in user does not disable role
   controls or show a "you cannot change your own roles" notice. The user can
   submit the mutation and then receives a generic or silent error.
2. The backend `PATCH /users/{id}/roles` endpoint returns the error as a 422
   validation error, but the frontend mutation error handler in `UserRolesTab`
   or wherever role assignment happens may not display it in a way the user
   understands.

## Proposed Change

1. **Frontend** — in the member/user role-editing surface (wherever
   `PATCH /users/{id}/roles` is triggered), detect whether the target user
   is the currently-authenticated user. If so, disable the role controls and
   show a tooltip/inline message: "You cannot modify your own roles."

2. **Frontend** — ensure the `onError` handler for the role-update mutation
   parses and displays the API error message (using `parseApiError`) with a
   toast, so that if the guard is ever bypassed, the user sees a clear message.

3. **Backend** — no change needed; the guard at line 671 of `users.py` is
   correct. This change is frontend-only.

## Out of Scope

- Allowing super admins to modify their own roles (intentionally blocked).
- Role editing in the portal (portal users do not have admin roles).

## Spec

See `openspec/specs/` (to be created alongside implementation).
