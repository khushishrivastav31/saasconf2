# Tasks — Notification bell shows what the notification is

## Phase 0 — Recon (done during planning)

- [x] Admin `NotificationBell` (`AdminLayout.tsx:186`) shows a badge from
      `GET /messaging/unread-count` but only `navigate()`s to the first
      conference on click — no panel, and the click is guarded by
      `if (topConference)`.
- [x] `GET /messaging/unread-count` (`global_unread.py`) groups by
      `conference_id` and is scoped to conference-domain threads only — so
      `conferences` can be empty while `total_unread_count > 0`, making the
      bell click a silent no-op.
- [x] Speaker bell (`PortalLayout.tsx:822`) is a `<Link>` to `/portal/messages`;
      `portal-unread-count` query already provides `{ unread_count }`.
- [x] User-menu outside-click dismissal pattern already exists in
      `AdminLayout` and can be reused for the popover.

## Phase 1 — Decisions (resolved 2026-06-15)

- [x] OQ1: empty-`conferences` → non-navigating "You have N unread message(s)" row.
- [x] OQ2: speaker dropdown is summary-only (no extra request, no backend change).
- [x] OQ3: keep the 30 s poll; render cached data when the popover opens.

## Phase 2 — Admin notifications dropdown

### RED
- [ ] `AdminLayout.test.tsx`: bell click opens a panel.
- [ ] Multiple `conferences` → one row each with name + count, linking to
      `/modules/conferences/{id}?section=messaging`.
- [ ] `total_unread_count > 0` with empty `conferences` → summary row renders and
      clicking it does **not** navigate (no dead click).
- [ ] Zero unread → "No new notifications" empty state.
- [ ] Outside-click and Esc close the panel.

### GREEN
- [ ] Extract `NotificationDropdown.tsx`; render badge + popover from the existing
      `queryKeys.admin.globalUnread` query (no new request).
- [ ] Implement the three render states + dismissal (outside-click + Esc).
- [ ] Wire ARIA: `aria-haspopup`/`aria-expanded` on the bell; `role="menu"` /
      `menuitem` rows; focus return to bell on close.

### REFACTOR
- [ ] No inline objects/arrays in render paths; memoise row list.

## Phase 3 — Speaker notifications dropdown

### RED
- [ ] `PortalLayout.test.tsx`: unread > 0 opens a panel with "You have N unread
      message(s)" + a "View all messages" link to `${basePath}/messages`.
- [ ] Zero unread → empty state.

### GREEN
- [ ] Replace the bell `<Link>` with the popover; reuse the `portal-unread-count`
      query; footer link to `${basePath}/messages`. Summary-only (no extra query).

### REFACTOR
- [ ] Share the popover dismissal hook between admin + portal if it reads cleanly.

## Phase 4 — Verify sweep (mandatory before PR)

- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] No backend/OpenAPI work — this change is frontend-only (decision 2).
- [ ] Handbook: note the notifications dropdown in `handbookSections.tsx`.

## Phase 5 — Ship

- [ ] Present commit message + PR title, ask once.
- [ ] On approval: commit, push, open PR (no `--auto`; user merges manually).
- [ ] After merge: move `openspec/changes/035-…` → `openspec/shipped/`.
