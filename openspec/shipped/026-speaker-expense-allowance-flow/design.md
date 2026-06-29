# Design — Speaker expense allowance workflow

This documents the **as-built** system (recon complete) and designs the
**remaining work**: email notifications and portal-side tests.

## Data model (as built — `app/models/speaker_expense.py`)

| Table | Purpose | Key fields |
|-------|---------|------------|
| `expense_categories` | Per-conference expense categories | `tenant_id`, `conference_id`, `name` |
| `expense_tiers` | Named budget tiers (e.g. "Keynote 1500 EUR") | `tenant_id`, `conference_id`, `name`, `max_amount`, `currency` |
| `speaker_expense_allowance_defaults` | Conference-wide default allowance | `tenant_id`, `conference_id`, `max_amount`, `currency` |
| `speaker_expense_allowances` | Per-speaker allowance | `conference_id`, `cfp_applicant_id`, `expense_tier_id?`, `max_amount`, `currency`, `source` (`auto`/`manual`/`tier`) |
| `speaker_expenses` | Submitted expense item | `conference_id`, `cfp_applicant_id`, `title`, `category_id?`, `original_amount`/`original_currency`/`converted_amount`/`conference_currency`, `status` (`draft`→`submitted`→`approved`/`rejected`→`paid`), `reviewed_by`, `review_notes`, `paid_at`, receipt attachment |

Speakers are identified by `cfp_applicant_id` (→ `CFPApplicant`), not a
generic `speaker_id`. The applicant's email (decrypted via `read_pii`) is
the notification target.

## Endpoints (as built)

### Admin — `/conferences/{conference_id}/speaker-expenses` (`TenantAdminDep`)

```
GET    /tiers                     POST /tiers   PUT/DELETE /tiers/{tier_id}
GET    /categories                POST /categories   PUT/DELETE /categories/{category_id}
GET    /allowance-defaults        POST /allowance-defaults   PUT/DELETE /allowance-defaults/{default_id}
GET    /allowances                PUT  /allowances/{allowance_id}
POST   /allowances/{allowance_id}/assign-tier
POST   /assign-tier
GET    /            (list, ?status= filter, search, pagination)
POST   /            (admin creates expense for a speaker)
GET    /stats
GET    /{expense_id}
POST   /{expense_id}/approve
POST   /{expense_id}/reject       (requires reason)
POST   /{expense_id}/mark-paid
```

### Speaker portal — `/portal/expenses` (`CurrentApplicantDep`)

```
GET    /portal/my-conferences
GET    /portal/expenses                       (own only)
GET    /portal/expenses/allowances            (balance)
GET    /portal/expenses/categories
POST   /portal/expenses                       (create draft)
PUT    /portal/expenses/{expense_id}
POST   /portal/expenses/{expense_id}/submit   (draft → submitted)
DELETE /portal/expenses/{expense_id}
GET    /portal/expenses/{expense_id}/attachments
```

### Settings — `app/api/v1/settings/speaker_expense_settings.py`

`GET`/`PUT` per-conference `expenses_enabled` flag
(`SpeakerExpenseSettings`).

## Frontend (as built)

- Admin: `pages/ConferenceDetail/tabs/SpeakerExpensesTab/` (defaults,
  allowances, review table, detail panel, reject modal, stats bar, tier
  budget bars) and `tabs/settings/SpeakerExpenseSettingsTab.tsx`.
- Portal: `pages/portal/PortalExpensesTab.tsx` (submit + own list, receipt
  upload via `validate_upload()`).

---

## Remaining work — design

### 1. Email notifications (new)

Add a `app/core/email/speaker_expenses.py` module following the existing
helper pattern (`app/core/email/privacy.py`): async functions taking
`db`, `tenant_id`, `recipient_email`, relevant context, and a
`tenant_name`; HTML-escape all interpolated user input; call
`send_email(..., db=db, tenant_id=tenant_id, email_type="...")`.

| Helper | `email_type` | Recipient | Trigger |
|--------|--------------|-----------|---------|
| `send_expense_submitted` | `expense_submitted` | conference admin(s) | portal `submit` (draft → submitted) |
| `send_expense_approved` | `expense_approved` | speaker (applicant) | admin `approve` |
| `send_expense_rejected` | `expense_rejected` | speaker (applicant) | admin `reject` (includes `review_notes`) |
| `send_expense_paid` *(optional)* | `expense_paid` | speaker (applicant) | admin `mark-paid` |

Wiring points:

- Portal submit handler (`submit_my_expense`) → `send_expense_submitted`.
- `speaker_expense_workflow_service.approve_expense` /
  `reject_expense` / `mark_expense_paid` → the speaker-facing helpers.

Sends are best-effort: failure to email must not roll back the status
transition (log and continue, consistent with other email call sites).
Resolve the speaker's email via the `SpeakerExpense.applicant`
relationship (`read_pii`); resolve admin recipients the same way other
admin-notification emails in the codebase do.

### 2. Portal-side tests (new)

`backend/tests/portal/test_speaker_expenses_portal.py`:

- Speaker can create a draft, update it, and submit it.
- `GET /portal/expenses` returns **only the caller's** expenses; another
  applicant's expenses are never visible (cross-applicant isolation).
- Submitting moves `draft → submitted` and triggers `EXPENSE_SUBMITTED`
  (assert the send helper is called, e.g. via the email mock used
  elsewhere in the suite).
- Tenant isolation holds.

### 3. Email tests

Extend backend expense tests so that `approve` / `reject` / `mark-paid`
assert the corresponding speaker email helper is invoked with the right
recipient and (for reject) the review note.

## Test Impact

| File | Change |
|------|--------|
| `backend/app/core/email/speaker_expenses.py` (new) | Email helpers |
| `backend/tests/portal/test_speaker_expenses_portal.py` (new) | Submit + own-only isolation + submit-email |
| `backend/tests/core/test_speaker_expenses.py` (extend) | Assert approve/reject/mark-paid emails |
| `frontend` | No new pages required; verify existing tabs still pass |
