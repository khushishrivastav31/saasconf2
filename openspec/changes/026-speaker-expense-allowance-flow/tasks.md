# Tasks — Speaker expense allowance workflow

## Phase 0 — Recon

- [ ] Document the actual columns on each of the three tables.
- [ ] Search for any existing expense endpoints.
- [ ] Search for any existing expense UI files.

## Phase 1 — Admin allowance defaults

### RED
- [ ] Tests for GET/PUT default endpoints.

### GREEN
- [ ] Implement endpoints.

### Frontend
- [ ] Settings tab + tests.

## Phase 2 — Per-speaker override

### RED
- [ ] Tests for GET list, PUT individual override.

### GREEN
- [ ] Implement endpoints.
- [ ] Add the override input to the speaker detail panel.

## Phase 3 — Speaker submission (portal)

### RED
- [ ] Tests: speaker submits expense, sees own submissions only.

### GREEN
- [ ] Portal endpoints + frontend "My Expenses" page.

## Phase 4 — Admin review queue

### RED
- [ ] Tests: list pending, approve, reject, mark paid.

### GREEN
- [ ] Admin endpoints + Finance → Expenses page.

## Phase 5 — Emails

- [ ] Add the three email template types.
- [ ] Wire send calls at the right points.

## Phase 6 — Full sweep + manual

- [ ] Backend + frontend full sweep.
- [ ] Manual: configure default → assign speaker → speaker submits
      expense → admin approves → mark paid → confirm all emails landed.
