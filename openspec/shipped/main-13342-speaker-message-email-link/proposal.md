# Change main-13342 — Speaker message-notification email link lands on the speaker portal

## Status
`planned` · Branch: TBD

## Ticket
MAIN-13342 — [SaasConf] As admin/speaker, I received a message, the flow is not the accurate

## Methodology
TDD — Red → Green → Refactor.

## Problem

When an admin/organizer replies to a speaker's message, the speaker receives a
"You have a new message" notification email. The email's **View Message**
button / direct link is:

```
http://localhost:3000/trendig/portal/messages/1835a0b8-04fd-4333-b008-ffdb9c9e0913
```

Clicking it does **not** open the conversation. Instead the speaker ends up on
the **admin** login page (`http://localhost:3000/login`). The expected behavior:

- If the speaker is already logged in to the portal → land **directly on the
  thread** with the new message open.
- If the speaker is **not** logged in → show the **portal** login
  (`/trendig/portal/user/login`), and after a successful login redirect
  straight to the thread.

### Root cause

The bug is a **URL-format mismatch** between the email link and the frontend
route, plus a missing post-login redirect:

1. **Email link uses path style; the frontend reads a query param.** The
   backend builds the portal link as a path segment
   (`/{slug}/portal/messages/{thread_id}`) in three places:
   - `backend/app/api/v1/cfp_portal/messaging/_helpers.py:120`
   - `backend/app/api/v1/messaging/_shared.py:80`
   - `backend/app/services/training_messaging/_core.py:386`

   But the portal `MessagesPage` opens a thread from the **query param**
   `?thread=<id>` (`frontend/src/pages/portal/MessagesPage/index.tsx:28`), and
   the only portal route registered is `messages` — there is **no**
   `messages/:threadId` route (`frontend/src/App.tsx:542`). The admin side is
   already consistent and query-based
   (`ConferenceDetail/tabs/MessagingTab/index.tsx:31` reads
   `searchParams.get('thread')`, and the admin email links use
   `...&thread={id}`).

2. **The path-style link matches no route**, so React Router falls through to
   the top-level catch-all `<Route path="*" element={<Navigate to="/" />}>`
   (`App.tsx:564`). `/` is an admin `ProtectedRoute`; the speaker has no admin
   session, so it redirects to the **admin** `/login` (`App.tsx:161-162`) — the
   wrong portal entirely.

3. **No redirect-back after portal login.** Even once the link points at the
   portal, `PortalLayout`'s auth gate redirects unauthenticated users to
   `${basePath}/user/login` **without** preserving the intended destination
   (`PortalLayout.tsx:428-430`), and `LoginPage` always navigates to
   `${basePath}/news` after login (`LoginPage.tsx:64-69`). So a logged-out
   speaker would still not be taken to the thread.

## Proposed Change

### 1. Align the portal email link with the frontend (query-param style)

Change the three portal-link builders to emit the query-param form the portal
already understands:

```
{PORTAL_BASE_URL}/{tenant_slug}/portal/messages?thread={thread.id}
```

This matches `MessagesPage` (`?thread=`) and the admin links (`&thread=`) with
no new route to register and no new param-reading code. Admin/user links are
**unchanged** — they already work.

No backend test asserts the constructed portal link string (the email-template
test at `backend/tests/core/test_email.py:882` passes `messages_link` in
directly), so this is a low-risk change.

### 2. Preserve the intended destination through portal login (redirect-back)

- `PortalLayout` auth gate: when redirecting an unauthenticated user to
  `${basePath}/user/login`, carry the originally requested location (path +
  search) so login can return there — mirroring the admin `ProtectedRoute`
  pattern that already passes `state={{ from: location }}` (`App.tsx:162`).
- `LoginPage`: after a successful login, if a "from" destination within this
  portal was provided, navigate there instead of the default `news` /
  `trainings` landing. Fall back to the existing default when absent.

### Resulting flow

- **Logged-in speaker** clicks the email → `/{slug}/portal/messages?thread=<id>`
  → `MessagesPage` selects and opens the thread (and marks it read).
- **Logged-out speaker** clicks the email → portal login → after login,
  redirected to `/{slug}/portal/messages?thread=<id>` → thread opens.

## Out of scope

- The admin/organizer notification link (already correct, query-based).
- Redesigning the messaging UI, thread/read semantics, or email templates.
- Switching to path-style portal URLs (rejected — see `design.md`).
