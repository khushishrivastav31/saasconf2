# QA — Self-Role Modification Guard

## Test users

| Role | Email | Password | How to create |
|------|-------|----------|---------------|
| Conferences Admin | `admin@bjvsoft.net` | `Test1234!` | Pre-seeded |
| Second admin (target) | `admin2@bjvsoft.net` | `Test1234!` | Log in as Conferences Admin → My Company → Members → Invite → set role "Conferences Admin" → follow setup link in MailHog |

> The key setup: you need **two admin accounts** so you can test editing someone else's roles (should work) vs. your own roles (should be blocked).

---

## Pre-conditions

- Logged in as Conferences Admin (`admin@bjvsoft.net`).
- A second team member exists (`admin2@bjvsoft.net` or any other user).

---

## Scenario A — Cannot edit own roles

**Role:** Conferences Admin (`admin@bjvsoft.net`)

1. Log in as `admin@bjvsoft.net`.
2. Navigate to **My Company → Members** (or wherever roles are managed).
3. Find your own row (`admin@bjvsoft.net`) in the member list.
4. **Expected:** Role controls (checkboxes, dropdowns, or edit button) are **disabled** or grayed out.
5. **Expected:** An inline message is visible: _"You cannot modify your own roles."_ (or similar wording).
6. Attempt to interact with the disabled controls.
7. **Expected:** Nothing happens — controls do not respond.

**PASS:** Controls disabled, message visible.
**FAIL:** Controls are enabled and the role change can be submitted.

---

## Scenario B — Can edit another member's roles

**Role:** Conferences Admin (`admin@bjvsoft.net`)

1. Find the row for `admin2@bjvsoft.net` (or another team member).
2. **Expected:** Role controls are **enabled** (not grayed out).
3. Change a role assignment and save.
4. **Expected:** Save succeeds — success toast appears.
5. Reload the page.
6. **Expected:** The change is persisted.

**PASS:** Edit works for other users, toast shown.
**FAIL:** Controls also disabled for other users (over-blocking).

---

## Scenario C — Backend guard returns a clear error if frontend is bypassed

> This tests the backend guard directly (e.g. via browser DevTools or curl).

**Role:** Conferences Admin

1. Open DevTools → Network tab.
2. Find the role-update request when editing roles in the UI.
3. Copy the request as `fetch` or use curl to send the same PATCH to
   `/users/{your-own-id}/roles` with a changed role payload.
4. **Expected:** Response is `422 Unprocessable Entity` with message:
   _"Cannot modify your own roles."_

**PASS:** 422 returned with the correct message.
**FAIL:** 200 returned and roles are changed.

---

## Scenario D — Error toast displayed if server rejects

**Role:** Conferences Admin

1. If the frontend guard is in place, this scenario may require temporarily
   bypassing the disabled state (e.g. removing the `disabled` attribute via
   DevTools) to submit the form.
2. Submit the role update for your own account.
3. **Expected:** A red error toast appears with the message from the server
   (e.g. _"Cannot modify your own roles."_).

**PASS:** Error toast shown with readable message.
**FAIL:** Silent failure — no toast, no indication of what went wrong.
