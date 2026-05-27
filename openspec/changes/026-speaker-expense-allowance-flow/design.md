# Design — Speaker expense allowance workflow

## Recon outputs

Before implementation, document:

- Field set on each of the three tables.
- Existing endpoints (if any) for allowances / expenses.
- Existing UI surfaces (admin and portal).

## Data model assumptions

| Table | Purpose | Key fields |
|-------|---------|------------|
| `speaker_expense_allowance_defaults` | Conference-wide default | `conference_id`, `currency`, `amount` |
| `speaker_expense_allowances` | Per-speaker override | `conference_id`, `speaker_id`, `amount`, `currency` |
| `speaker_expenses` | Submitted expense | `allowance_id`, `category`, `amount`, `description`, `receipt_attachment_id`, `status`, `reviewed_by`, `review_notes` |

## Endpoints

### Admin (TenantAdminDep)

```
GET    /conferences/{id}/expense-allowances/default
PUT    /conferences/{id}/expense-allowances/default
GET    /conferences/{id}/speaker-allowances
PUT    /conferences/{id}/speaker-allowances/{speaker_id}
GET    /conferences/{id}/speaker-expenses?status=pending
PATCH  /speaker-expenses/{id}/review   (status + note)
PATCH  /speaker-expenses/{id}/mark-paid
```

### Speaker portal (CurrentApplicantDep)

```
GET    /portal/me/expenses
POST   /portal/me/expenses             (submit)
GET    /portal/me/allowance            (read current balance)
```

## Frontend

### Admin

- Conference Settings → Expense Allowances tab: configure default.
- Speaker detail panel → "Allowance" section with override input.
- New tab under Finance → "Speaker Expenses" with the review queue.

### Portal

- Sidebar item "Expenses" (visible only to speakers with an allowance).
- Submission form with receipt upload (uses existing
  `validate_upload()`).

## Emails

- `EXPENSE_SUBMITTED` (admin notification).
- `EXPENSE_APPROVED` / `EXPENSE_REJECTED` (speaker notification).

## Test Impact

| File | Change |
|------|--------|
| `tests/finance/test_speaker_allowances.py` (new) | Default + override CRUD |
| `tests/finance/test_speaker_expenses.py` (new) | Submit, review, approve/reject, mark paid |
| `tests/portal/test_speaker_expenses_portal.py` (new) | Speaker can submit + see own expenses only |
| Frontend tests for each new page |
