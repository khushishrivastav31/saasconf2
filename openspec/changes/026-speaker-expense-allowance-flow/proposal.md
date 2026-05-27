# Change 026 — Speaker expense allowance workflow

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 5.5.2: Conferences need to handle speaker expense allowances — a
budget per speaker for travel/accommodation, and a way for speakers to
submit expenses against that budget. The feature is currently BLOCKED
because no speakers exist in the test environment, but it's also
unclear how complete the underlying implementation is.

Tables exist in the schema:
- `speaker_expense_allowance_defaults` (conference-wide defaults)
- `speaker_expense_allowances` (per-speaker allowance)
- `speaker_expenses` (submitted expense items)

What's missing: an end-to-end flow connecting them, an admin review UI,
and a portal-side submission form for speakers.

## Proposed Change

1. **Recon** — audit the existing tables and any partial endpoints.
2. **Admin flow** — Settings page to configure default allowance per
   conference. Per-speaker override on the speaker detail panel.
3. **Speaker portal flow** — "My expenses" page where a speaker can
   submit an expense (category, amount, receipt upload, notes). Status
   defaults to "pending review".
4. **Admin review** — list of pending expenses per conference, approve
   / reject with a note, mark as paid.
5. **Email notifications** — confirm submission, notify on
   approval/rejection.

## Out of Scope

- Direct payment integration (Stripe, bank transfer). Mark expenses as
  "paid" manually.
- Tax/VAT handling on expenses (defer to invoices module).
- Multi-currency conversion for expense reporting.

## Spec

See `openspec/specs/` once implementation lands.
