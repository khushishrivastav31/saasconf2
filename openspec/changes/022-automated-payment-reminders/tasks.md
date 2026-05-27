# Tasks — Automated payment reminders

## Phase 0 — Recon

- [ ] Confirm `payment-reminder-cron` is wired in docker-compose and
      calls `POST /ops/send-payment-reminders`.
- [ ] Check whether `POST /ops/send-payment-reminders` exists and what
      it currently returns.
- [ ] Confirm `payment_reminders` table schema.

## Phase 1 — Model + migration

### RED
- [ ] Test: `Conference.send_automated_payment_reminders` defaults to
      false.

### GREEN
- [ ] Add column + Alembic migration.

## Phase 2 — Ops endpoint

### RED
- [ ] Test: opt-out conferences are skipped.
- [ ] Test: at 7 days overdue, reminder is sent.
- [ ] Test: 3-day cooldown prevents duplicate reminders.
- [ ] Test: paid invoices are not reminded.

### GREEN
- [ ] Implement `POST /ops/send-payment-reminders` per design.

### REFACTOR
- [ ] Extract overdue-milestone computation into a small helper.

## Phase 3 — Email template

- [ ] Add `PAYMENT_REMINDER` template type + seed default body/subject.
- [ ] Test: template renders with invoice variables.

## Phase 4 — Frontend toggle

### RED
- [ ] Test: toggle persists via PATCH and reflects on next load.

### GREEN
- [ ] Add the checkbox to Settings.

## Phase 5 — Full sweep + manual

- [ ] Backend + frontend full sweep.
- [ ] Manual: create overdue invoice → toggle reminders ON → trigger
      the cron locally (`curl POST /ops/...`) → verify email in MailHog.
- [ ] Manual: toggle OFF → run cron again → no email.
