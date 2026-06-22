# Design — Speaker message-notification email link

## Decision 1: Query-param link vs. new path route

The frontend already consumes the thread id as a **query param** in both
surfaces:

- Portal: `MessagesPage` reads `searchParams.get('thread')`
  (`MessagesPage/index.tsx:28`) and reacts to it via `useEffect`
  (`:37-39`).
- Admin: `MessagingTab` reads `searchParams.get('thread')`
  (`ConferenceDetail/tabs/MessagingTab/index.tsx:31`); admin emails already
  link with `...&thread={id}`.

Two ways to make the speaker link work:

- **(A — chosen) Make the portal email link query-based**:
  `…/portal/messages?thread={id}`. One-line change in each of the three
  builders; no new route; no new component logic; consistent with the admin
  side. The existing `messages` route + `MessagesPage` handle it as-is.
- **(B — rejected) Add a `messages/:threadId` path route** and read the path
  param in `MessagesPage`. More surface area: a new route, plus reconciling
  path-param and query-param sources of truth inside `MessagesPage` (the
  component sets `?thread=` itself on select/compose). No user-facing benefit
  over (A).

**Chosen: A.** Minimal, DRY, and consistent with the existing query-param
convention on both portals.

## Decision 2: How to carry the post-login destination

Use the same idiom the admin `ProtectedRoute` already uses:
`<Navigate to={loginPath} state={{ from: location }} />` (`App.tsx:162`).

- On a cold deep-link from the email, the browser loads the SPA, the router
  matches `/{slug}/portal/messages?thread=<id>`, `PortalLayout` mounts, sees no
  session, and performs a **client-side** `<Navigate>` to the portal login.
  Because it is client-side, React Router `state` is preserved across that
  redirect — `LoginPage` can read `location.state.from`.
- `location` from `useLocation()` includes `pathname` **and** `search`, so the
  `?thread=<id>` query survives.

`LoginPage` change: after `login(...)` succeeds, compute the redirect target:

```
const from = (location.state as { from?: Location } | null)?.from;
const target =
  from && from.pathname?.startsWith(basePath)
    ? `${from.pathname}${from.search ?? ''}`
    : (!me.has_conference_account && me.has_training_account
        ? `${basePath}/trainings`
        : `${basePath}/news`);
navigate(target);
```

The `from.pathname.startsWith(basePath)` guard is an **open-redirect / wrong
-tenant safeguard**: only return to a location inside *this* portal; otherwise
fall back to the existing default landing.

`PortalLayout` change (`:428-430`): add `state={{ from: location }}` (and
`useLocation()` is already imported) to the auth-gate `<Navigate>`.

### Why not a `?redirect=` query param instead of router state?

Router state is enough for the click-through flow and matches the existing
admin pattern. State is only lost if the user manually refreshes the login page
before authenticating — an acceptable edge case that degrades gracefully to the
default landing. Keeping parity with `ProtectedRoute` avoids introducing a
second redirect convention.

## Affected files

Backend (link format):
- `backend/app/api/v1/cfp_portal/messaging/_helpers.py:120`
- `backend/app/api/v1/messaging/_shared.py:80`
- `backend/app/services/training_messaging/_core.py:386`

Frontend (redirect-back):
- `frontend/src/pages/portal/PortalLayout.tsx` (auth-gate `<Navigate>`,
  `:428-430`)
- `frontend/src/pages/portal/LoginPage.tsx` (post-login navigation,
  `:62-69`)

## Tests

Backend (`backend/tests/`):
- Assert each of the three builders produces
  `…/portal/messages?thread={thread_id}` (query form). The existing messaging
  notification tests are the natural home; if none assert the link today, add
  focused unit assertions around `_notify_other_participants` /
  `_shared.py` / `training_messaging._core` by mocking
  `send_email_background` and inspecting the `messages_link` kwarg.

Frontend (`__tests__` siblings):
- `LoginPage`: given `location.state.from` inside the portal, after successful
  login it navigates to that path+search (not `news`). Given no `from`, it
  keeps the current default (conference user → `news`, training-only →
  `trainings`).
- `LoginPage`: a `from` outside the portal base path is ignored (falls back to
  default) — open-redirect guard.
- `PortalLayout`: an unauthenticated user rendering a portal route is
  redirected to `${basePath}/user/login` carrying `state.from` equal to the
  requested location. (Mirror the existing `PortalLayout.test.tsx` setup.)

## Risk / rollback

Low. Backend change is a string format; frontend change is additive
(falls back to today's behavior when no `from` is present). No schema, no
migration, no API contract change → **no OpenAPI regeneration needed**.
Rollback = revert the PR.
