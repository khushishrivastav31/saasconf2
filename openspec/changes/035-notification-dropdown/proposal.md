# Change 035 — Make the notification bell show *what* the notification is (admin + speaker)

## Status
`planned` · Branch: `feat/notification-dropdown`

## Methodology
TDD — Red → Green → Refactor.

## Problem

Staging review surfaced this defect (screenshot attached to the task — Tenant
Admin "Uwe Gelfert" with a red **1** badge on the top-bar bell):

> *As admin/speaker I can't see the notification (maybe a message was received).*

The bell renders an unread **count**, but there is no way to see **what** the
notification is:

1. **Admin bell does not open a panel.** `NotificationBell`
   (`AdminLayout.tsx:186`) shows the badge from `GET /messaging/unread-count`,
   but on click it only calls `navigate()` to the *first* conference's Messages
   tab. There is no dropdown listing the unread items, so the admin can't tell
   which conference / how many threads the badge represents before being yanked
   to another page.

2. **Clicking can silently do nothing.** The click handler is guarded by
   `if (topConference)`. `GET /messaging/unread-count`
   (`global_unread.py`) **only counts conference-domain threads**
   (`domain == THREAD_DOMAIN_CONFERENCE`, line 60) and groups by
   `conference_id`. If the user's only unread thread is training-domain (or any
   thread the grouping can't attribute to a conference), `conferences` is empty,
   `topConference` is `undefined`, and **clicking the bell does nothing at all**
   while the badge still shows a number — exactly the "I can't see the
   notification" report.

3. **Speaker bell is link-only, no preview.** The portal bell
   (`PortalLayout.tsx:822`) is a plain `<Link>` to `/portal/messages`. It works
   (the Messages page lists threads), but like the admin bell it gives no
   at-a-glance view of *what* is unread.

## Proposed Change

Turn the bell into an actual **notifications dropdown** on both surfaces: click
the bell → a popover lists the unread items with counts; each row navigates to
the relevant Messages view; the popover closes on outside-click / Esc. The badge
math and polling stay as-is.

### 1. Admin — notifications dropdown (`NotificationBell`)

- On click, toggle a popover anchored under the bell (same outside-click / Esc
  dismissal pattern already used by the user menu in `AdminLayout`).
- Body:
  - **Has unread** → a list of the `conferences` rows from
    `GET /messaging/unread-count` (conference name + unread count badge). Each
    row links to `/modules/conferences/{conference_id}?section=messaging` and
    closes the popover.
  - **Count > 0 but `conferences` empty** (the silent-click case) → a single
    "You have N unread message(s)" row that links to a sensible inbox fallback
    instead of dead-ending. (See Open Question 1 for the fallback target.)
  - **No unread** → a muted "No new notifications" empty state.
- Keep the existing red count badge on the bell itself.
- Accessibility: `aria-haspopup`, `aria-expanded`, `role="menu"` / `menuitem`,
  focusable rows, Esc to close, focus returns to the bell.

### 2. Speaker — same dropdown affordance (`PortalLayout` bell)

- Replace the bare `<Link>` bell with the same popover pattern: a short list of
  unread threads (or a "You have N unread message(s)" summary) plus a "View all
  messages" footer link to `/portal/messages`.
- Reuse the portal unread query already in `PortalLayout`
  (`/portal/messages/unread-count`). If a lightweight thread preview is wanted,
  fetch the top few unread threads lazily **only when the popover opens**
  (`enabled: open`) so we don't add a background poll. (See Open Question 2.)

### 3. Backend — none

`GET /messaging/unread-count` already returns per-conference rows, and the portal
`/portal/messages/unread-count` already returns `{ unread_count }` — both are
enough for the dropdowns. With the speaker dropdown resolved to **summary-only**
(decision 2), **this change touches no backend code and adds no endpoint**.

## Out of Scope

- A full notification *center* / history (read + dismissed items). This is
  unread **messages** only — the existing surfaces, made visible.
- New notification *types* (deadlines, privacy requests, etc. keep their own
  existing badges).
- Real-time push / websockets — polling cadence is unchanged (30 s).
- Training-domain unread surfacing in the **admin global** count (the endpoint's
  conference-domain scope is intentional; we only stop the click from
  dead-ending — see Open Question 1).
- Marking messages read from the dropdown (read state still updates when the
  thread is opened).

## Affected Code

- `frontend/src/components/layout/AdminLayout.tsx` — `NotificationBell` becomes a
  dropdown (likely extracted into its own component +
  `NotificationDropdown.tsx`).
- `frontend/src/pages/portal/PortalLayout.tsx` — bell becomes a dropdown.
- `frontend/src/components/layout/__tests__/AdminLayout.test.tsx` and
  `frontend/src/pages/portal/__tests__/PortalLayout.test.tsx` — dropdown
  behaviour tests.
- `frontend/src/pages/Handbook/handbookSections.tsx` — note the new dropdown.

(No backend files — see section 3.)

## Resolved decisions (confirmed 2026-06-15)

1. **Empty-`conferences` fallback target (admin).** Show "You have N unread
   message(s)" as **non-navigating** text so the badge is explained without a
   dead click. Widening the count endpoint to training-domain threads is a
   deferred follow-up.

2. **Speaker dropdown depth.** **Summary-only**: "You have N unread message(s)"
   + a "View all messages" footer link to `${basePath}/messages`, with **no
   extra request**. Thread-subject previews are out of scope here (possible fast
   follow). → no backend change for this change.

3. **Polling while open.** Keep the existing 30 s `refetchInterval` unchanged;
   the popover renders whatever the cached query holds when opened.

## Spec

See `openspec/specs/` once implementation lands.
