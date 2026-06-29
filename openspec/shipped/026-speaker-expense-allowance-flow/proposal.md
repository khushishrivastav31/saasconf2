# Change 026 — Speaker expense allowance workflow

## Status
`in-progress` · Jira: MAIN-13418 · Branch: TBD

> **Reconciled with shipped code (recon complete).** The bulk of this
> feature already exists — models, admin/portal/settings endpoints,
> frontend tabs, and admin-side tests all shipped under
> "feat: add cost management with budget planning and speaker expenses"
> (`b8a8b62`) and later refactors. This proposal now reflects what is
> built and scopes the **two remaining deliverables**: email
> notifications and portal-side tests.

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 5.5.2 / MAIN-13418: Conferences need to handle speaker expense
allowances — a budget per speaker for travel/accommodation, and a way for
speakers to submit expenses against that budget, with an admin
review/approval/payment workflow and email notifications to both parties.

## Already implemented (recon findings)

- **Data model** (`app/models/speaker_expense.py`): `ExpenseCategory`,
  `ExpenseTier` (named budget tiers), `SpeakerExpenseAllowanceDefault`
  (conference defaults), `SpeakerExpenseAllowance` (per-speaker, keyed by
  `cfp_applicant_id`, with `expense_tier_id` + `source` of
  `auto`/`manual`/`tier`), and `SpeakerExpense` (full
  `draft → submitted → approved/rejected → paid` workflow, receipt
  attachments, and **multi-currency** fields).
- **Admin endpoints** (`/conferences/{id}/speaker-expenses/...`,
  `TenantAdminDep`): tiers CRUD, categories CRUD, allowance-defaults CRUD,
  per-speaker allowances + assign-tier, expense list/detail/stats, and
  `approve` / `reject` / `mark-paid`.
- **Portal endpoints** (`/portal/expenses/...`, `CurrentApplicantDep`):
  list own, submit, update, submit-for-review, delete, allowances/balance,
  categories, attachments.
- **Settings**: per-conference `expenses_enabled` flag
  (`app/api/v1/settings/speaker_expense_settings.py`).
- **Frontend**: admin `SpeakerExpensesTab/` suite (defaults, allowances,
  review table, detail panel, reject modal, stats, tier budget bars),
  `SpeakerExpenseSettingsTab`, and the portal `PortalExpensesTab`.
- **Tests**: `backend/tests/core/test_speaker_expenses.py` — thorough
  admin-side coverage (settings, tiers, categories, defaults, allowances,
  admin creation, approve/reject/mark-paid with state-transition guards,
  list/filter/search/pagination, stats).

## Remaining work

1. **Email notifications (not built).** No expense email helpers exist and
   the workflow service sends none. Add:
   - `EXPENSE_SUBMITTED` → notify conference admins when a speaker submits.
   - `EXPENSE_APPROVED` / `EXPENSE_REJECTED` → notify the speaker on
     outcome (rejection includes the review note).
   - (Optional) `EXPENSE_PAID` → notify the speaker when marked paid.
   Wire the sends into the portal submit path and the admin
   approve/reject/mark-paid paths.
2. **Portal-side tests (missing).** A speaker can submit and see only
   their own expenses; cross-applicant isolation is enforced.

## Out of Scope

- Direct payment integration (Stripe, bank transfer). "paid" is a manual
  status.
- Tax/VAT handling on expenses (defer to invoices module).
- Reworking the already-shipped multi-currency fields. (Note: the QA
  ticket lists multi-currency as out of scope, but the shipped
  `SpeakerExpense` model already carries currency-conversion columns; this
  change does not add to or remove them.)

## Spec

Feature spec lands in `openspec/specs/` when this change merges.
