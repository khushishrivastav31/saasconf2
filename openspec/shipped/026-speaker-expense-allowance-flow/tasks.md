# Tasks — Speaker expense allowance workflow

## Phase 0 — Recon  ✅ complete (see proposal/design)

- [x] Document the actual tables/columns. **Finding:** five tables in
      `app/models/speaker_expense.py` — `expense_categories`,
      `expense_tiers`, `speaker_expense_allowance_defaults`,
      `speaker_expense_allowances` (keyed by `cfp_applicant_id`,
      `source` auto/manual/tier), `speaker_expenses`
      (`draft→submitted→approved/rejected→paid`, multi-currency, receipt).
- [x] Search for existing endpoints. **Finding:** admin router
      `/conferences/{id}/speaker-expenses/*`, portal router
      `/portal/expenses/*`, settings `expenses_enabled`. All present.
- [x] Search for existing UI. **Finding:** admin `SpeakerExpensesTab/`
      suite + `SpeakerExpenseSettingsTab`, portal `PortalExpensesTab`.

## Phase 1 — Admin allowance defaults  ✅ shipped

- [x] GET/POST/PUT/DELETE `allowance-defaults` endpoints.
- [x] Settings tab. Covered by `tests/core/test_speaker_expenses.py`
      (`TestAllowanceDefaults`, `TestSpeakerExpenseSettings`).

## Phase 2 — Per-speaker allowance + tiers  ✅ shipped

- [x] List allowances, PUT override, assign-tier endpoints.
- [x] Admin UI (`AllowancesView`, `DefaultsView`, tier budget bars).
      Covered by `TestSpeakerAllowances`, `TestExpenseTiers`.

## Phase 3 — Speaker submission (portal)  ✅ shipped

- [x] GREEN: portal endpoints + `PortalExpensesTab`
      (create/update/submit/delete/own-list/allowances/categories).
- [x] `tests/portal/test_speaker_expenses_portal.py`
      — speaker submits an expense; `GET /portal/expenses` returns only
      the caller's rows; cross-applicant + tenant isolation enforced.

## Phase 4 — Admin review queue  ✅ shipped

- [x] List (status filter/search/pagination), approve, reject (requires
      reason), mark-paid, stats. Admin `ExpenseRowsTable` /
      `ExpenseDetailPanel` / `RejectExpenseModal` / `ExpensesStatsBar`.
      Covered by `TestExpenseWorkflow`, `TestExpenseListAndDetail`,
      `TestExpenseStats`, `TestAdminExpenseCreation`.

## Phase 5 — Emails  ✅ shipped

### RED
- [x] `test_speaker_expenses.py` (extend): `approve` sends
      `expense_approved` to the speaker; `reject` sends `expense_rejected`
      with the review note; `mark-paid` sends `expense_paid`.
- [x] `test_speaker_expenses_portal.py`: portal `submit` sends
      `expense_submitted` to the conference admin(s).

### GREEN
- [x] `app/core/email/speaker_expenses.py` with
      `send_expense_submitted` / `send_expense_approved` /
      `send_expense_rejected` / `send_expense_paid`, following
      the `app/core/email/privacy.py` pattern.
- [x] Wire `send_expense_submitted` into the portal `submit_my_expense`
      path.
- [x] Wire speaker-facing helpers into
      `speaker_expense_workflow_service.approve_expense` /
      `reject_expense` / `mark_expense_paid`. Best-effort.

### REFACTOR
- [x] Recipient emails via `SpeakerExpense.applicant` (read_pii property);
      admin recipients via `resolve_privacy_notify_recipients`.

## Phase 6 — Full sweep + manual

- [x] Backend sweep: targeted pytest, `mypy app/`,
      `ruff check/format app/`, full `pytest tests/ -n 4 -q`.
- [x] Frontend sweep: `pnpm exec tsc --noEmit`, `pnpm exec eslint src/`,
      `pnpm test`.
- [x] No endpoint/schema changes — OpenAPI drift check not needed.

## Ship

- [x] Folder moved from `openspec/changes/` to `openspec/shipped/`.
