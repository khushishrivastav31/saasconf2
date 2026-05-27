# Design — Automated payment reminders

## Backend ops endpoint

### `POST /ops/send-payment-reminders`

- Auth: `OPS_API_KEY` (already used by other ops endpoints).
- Behaviour (pseudocode):

```python
today = date.today()
overdue_milestones = {7, 14, 30}  # days overdue at which to remind

for invoice in fetch_unpaid_overdue_invoices():
    days_overdue = (today - invoice.due_date).days
    if days_overdue not in overdue_milestones:
        continue

    last_reminder = await latest_reminder(invoice.id)
    if last_reminder and (today - last_reminder.sent_at.date()).days < 3:
        continue  # cooldown

    if not conference.send_automated_payment_reminders:
        continue  # opt-in not enabled

    await send_payment_reminder_email(invoice)
    await record_reminder(invoice, days_overdue)
```

### Email template

`EmailTemplateType.PAYMENT_REMINDER` with the variables noted in the
proposal.

## Frontend — Settings toggle

Locate the conference Settings tab. Add a new checkbox:

```tsx
<Checkbox
  label="Send automated payment reminders"
  checked={settings.send_automated_payment_reminders}
  onChange={...}
/>
```

Persist via `PATCH /conferences/{id}/settings`.

## Models

- `Conference.send_automated_payment_reminders: bool` (default false).
  New migration.
- `payment_reminders` already exists.

## Test Impact

| File | Change |
|------|--------|
| `tests/ops/test_payment_reminders.py` (new) | Happy path, cooldown, opt-out, milestones |
| `tests/conferences/test_payment_reminder_settings.py` (new) | Toggle persists |
| `SettingsTab.test.tsx` (extend) | Checkbox renders + toggles |
