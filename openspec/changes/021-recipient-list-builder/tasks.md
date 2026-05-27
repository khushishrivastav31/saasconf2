# Tasks — Recipient list builder

## Phase 0 — Recon

- [ ] Confirm `recipient_lists` and `recipient_list_members` tables
      exist.
- [ ] Audit existing recipient-list endpoints in the backend. Note what
      exists and what's missing.
- [ ] Decide route placement (Settings vs Communications).

## Phase 1 — Backend CRUD

### RED
- [ ] Tests for each missing endpoint (CRUD on lists + members,
      tenant isolation, admin guard).

### GREEN
- [ ] Implement endpoints.

### REFACTOR
- [ ] Consolidate ownership/RLS helpers if duplication appears.

## Phase 2 — Frontend list page

### RED
- [ ] Test: page renders existing lists, opens create modal.

### GREEN
- [ ] Build `RecipientListsPage.tsx`.

## Phase 3 — Frontend detail page

### RED
- [ ] Test: detail page shows members, supports add/remove.

### GREEN
- [ ] Build `RecipientListDetailPage.tsx` + `AddMembersModal.tsx`.

## Phase 4 — Full sweep

- [ ] Backend full sweep.
- [ ] Frontend full sweep.
- [ ] Manual: create a list → add 3 members → send a bulk email to the
      list → verify all 3 receive it (MailHog).
