# Tasks — Speaker message-notification email link

## Phase 0 — Recon (done during planning)

- [x] Confirm the email link for **applicants/speakers** is path-style
      `…/portal/messages/{thread_id}` in all three builders
      (`_helpers.py:120`, `_shared.py:80`, `training_messaging/_core.py:386`).
- [x] Confirm the portal `MessagesPage` opens a thread only from the
      `?thread=<id>` **query param** (`MessagesPage/index.tsx:28,37-39`) and
      that **no** `messages/:threadId` route exists (`App.tsx:542`).
- [x] Confirm a path-style link falls through to the top-level `*` catch-all
      → `/` (admin `ProtectedRoute`) → admin `/login` (`App.tsx:161-162,564`).
- [x] Confirm `PortalLayout` auth gate redirects to the **portal** login
      without preserving the destination (`PortalLayout.tsx:428-430`) and
      `LoginPage` always lands on `news`/`trainings` (`LoginPage.tsx:64-69`).
- [x] Confirm the admin side is already query-based and correct
      (`MessagingTab/index.tsx:31`; admin links use `&thread=`).
- [x] Confirm no backend test asserts the constructed portal link string.

## Phase 1 — Backend: query-param link (TDD)

### RED — write failing tests first
- [ ] Test that the conference reply/notify path builds the speaker link as
      `…/portal/messages?thread={thread_id}` (mock `send_email_background`,
      inspect `messages_link` kwarg) — covering `_shared.py` and
      `_helpers._notify_other_participants`.
- [ ] Test the training notify path builds the same query form
      (`training_messaging/_core.py`).
- [ ] Run → confirm they fail (current code emits path style).

### GREEN — minimum implementation
- [ ] `_helpers.py:120` → `…/portal/messages?thread={thread.id}`.
- [ ] `_shared.py:80` → `…/portal/messages?thread={thread.id}`.
- [ ] `training_messaging/_core.py:386` → `…/portal/messages?thread={r.thread_id}`.
- [ ] Re-run targeted tests → green.

## Phase 2 — Frontend: redirect-back (TDD)

### RED — write failing tests first
- [ ] `LoginPage`: with `location.state.from` inside the portal, after login
      navigates to that `pathname+search` (e.g. `/{slug}/portal/messages?thread=X`).
- [ ] `LoginPage`: with no `from`, keeps default (conference → `news`,
      training-only → `trainings`).
- [ ] `LoginPage`: `from` outside `basePath` is ignored (open-redirect guard).
- [ ] `PortalLayout`: unauthenticated render redirects to
      `${basePath}/user/login` with `state.from` = requested location.
- [ ] Run → confirm they fail.

### GREEN — minimum implementation
- [ ] `PortalLayout.tsx:428-430` — add `state={{ from: location }}` to the
      auth-gate `<Navigate>`.
- [ ] `LoginPage.tsx:62-69` — read `location.state.from`, navigate to it when
      it starts with `basePath`; otherwise fall back to today's default.
- [ ] Re-run targeted tests → green.

## Phase 3 — Refactor
- [ ] Tidy naming/duplication in the redirect-target computation; keep tests
      green.

## Phase 4 — Full verification sweep (per CLAUDE.md)
- [ ] `cd backend && venv/bin/python -m pytest tests/<targeted> -v`
- [ ] `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `cd backend && ruff check app/ && ruff format --check app/`
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `cd backend && venv/bin/python -m pytest tests/ -n 4 -q`
- [ ] `cd frontend && pnpm test`
- [ ] No OpenAPI change → skip `pnpm gen:api` (confirm `pnpm gen:api:check`
      prints nothing).
- [ ] No user-visible UI/route copy change → handbook update not required
      (confirm during review).

## Phase 5 — Manual verification
- [ ] As a speaker, receive a new-message email; **logged in** → clicking the
      link opens the thread directly.
- [ ] **Logged out** → clicking the link shows the portal login, and after
      login redirects straight to the thread.

## Phase 6 — Ship
- [ ] Move this folder from `openspec/changes/` to `openspec/shipped/` in the
      same PR.
