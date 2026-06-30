# Design notes — Change 035

## Root cause

The bell is a **badge without a panel**. Two distinct symptoms, one cause:

- **Admin** (`AdminLayout.tsx:186`): `onClick` does
  `if (topConference) navigate(...)`. `topConference = data?.conferences?.[0]`.
  `GET /messaging/unread-count` (`global_unread.py`) groups unread threads by
  `conference_id` and is scoped to `domain == THREAD_DOMAIN_CONFERENCE`
  (line 60). So `conferences` can be empty while `total_unread_count` is 0 —
  *and* the count itself only reflects conference threads. When `conferences`
  is empty the click is a no-op, which reads to the user as "the notification
  isn't there."
- **Speaker** (`PortalLayout.tsx:822`): bell is a `<Link>` to
  `/portal/messages`. Functional, but no at-a-glance content.

Fix = give the bell a popover that renders the data we already fetch.

## Admin dropdown shape

The data is already in hand — no new query, no backend change:

```ts
const { data } = useQuery<GlobalUnreadCountResponse>({
  queryKey: queryKeys.admin.globalUnread,
  queryFn: () => api.get('/messaging/unread-count').then((r) => r.data),
  refetchInterval: 30_000,
  staleTime: 15_000,
});
// data.total_unread_count, data.conferences[] = { conference_id, conference_name, unread_count }
```

Popover states:

| Condition | Render |
| --- | --- |
| `conferences.length > 0` | one `menuitem` per conference → name + count badge, links to `…/{id}?section=messaging` |
| `total_unread_count > 0 && conferences.length === 0` | non-navigating "You have N unread message(s)" row (Open Question 1 — proposed) |
| `total_unread_count === 0` | muted "No new notifications" |

Dismissal reuses the existing user-menu pattern in `AdminLayout`
(`mousedown` outside-click listener + a ref), extended with Escape-to-close.
Extract `NotificationBell` + the panel into `NotificationDropdown.tsx` so the
state/effect logic is testable in isolation and doesn't bloat `AdminLayout`.

## Speaker dropdown shape

Reuse the existing `portal-unread-count` query already in `PortalLayout`
(`{ unread_count }`). Summary-only first:

- `unread_count > 0` → "You have N unread message(s)" + a "View all messages"
  footer `<Link>` to `${basePath}/messages`.
- `unread_count === 0` → "No new notifications".

If Open Question 2 → previews, add a query gated on `enabled: open` that pulls
the top few unread threads from the existing portal thread-list endpoint
(filter by unread, `limit` 5); strictly lazy so the idle poll cost is unchanged.

## Why not widen the count endpoint now

Making `GET /messaging/unread-count` include training-domain threads would mean
`ConferenceUnreadCount` (which keys on `conference_id`) can't represent them —
the code comment at `global_unread.py:56-60` calls this out and defers the
unified per-domain count to the portal inbox. Pulling that into this change
balloons scope. Instead we make the **empty-`conferences`** case explain itself
(show the count) so the badge is never a dead click, and file the unified-count
widening as a follow-up.

## Accessibility / interaction

- Bell: `aria-haspopup="menu"`, `aria-expanded={open}`.
- Panel: `role="menu"`; rows `role="menuitem"`, keyboard-focusable.
- Esc closes and returns focus to the bell; outside-click closes.
- Dark-mode `dark:` variants on every panel surface (matches existing top-bar).

## Resolved decisions (open questions)

All three open questions were confirmed at the proposed defaults (2026-06-15):

1. **Empty-`conferences` fallback (admin).** When `total_unread_count > 0` but
   `conferences` is empty, render a **non-navigating** "You have N unread
   message(s)" row so the badge is explained but the click never dead-ends. A
   follow-up will widen `GET /messaging/unread-count` to include training-domain
   threads (deferred — see "Why not widen the count endpoint now").
2. **Speaker dropdown depth.** **Summary-only** first: "You have N unread
   message(s)" + a "View all messages" footer link to `${basePath}/messages`,
   with **no extra request**. Thread-subject previews are a possible fast follow,
   not part of this change → no backend work, no `enabled: open` preview query.
3. **Polling while open.** Keep the existing **30 s `refetchInterval`
   unchanged**; the popover renders whatever the cached query already holds when
   opened (no refresh-on-open, no pause).

## Testing strategy

- **Admin** (`AdminLayout.test.tsx`): mock `/messaging/unread-count` →
  (a) multiple conferences renders rows with counts and correct links;
  (b) count > 0 with empty `conferences` renders the summary row and the click
  is a no-op (no navigation); (c) zero unread renders the empty state;
  (d) outside-click / Esc closes the panel.
- **Speaker** (`PortalLayout.test.tsx`): unread > 0 opens a panel with the
  summary + "View all messages" link to `${basePath}/messages`; zero unread
  shows the empty state.
- No backend tests unless a preview endpoint is added (Open Question 2).
