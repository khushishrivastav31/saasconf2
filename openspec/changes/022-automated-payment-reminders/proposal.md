# Change 022 — Automated payment reminders

## Status
`planned` · Branch: TBD

## Methodology
TDD — Red → Green → Refactor.

## Problem

QA 1.4.5.8: Conference admins want overdue invoices to trigger automated
reminder emails (e.g. "Your invoice is 7 days overdue"). Currently the
feature is marked SKIP — not implemented.

There IS a cron job `payment-reminder-cron` already wired up in
`deploy/staging/docker-compose.yml` calling
`POST /ops/send-payment-reminders` daily. So the schedule is in place,
but the underlying ops endpoint is missing or stubbed.

## Proposed Change

1. **Backend** — implement `POST /ops/send-payment-reminders`:
   - Find unpaid invoices past their due date.
   - For each, check whether a reminder was sent recently (cooldown
     period, e.g. 3 days) using the existing `payment_reminders` table.
   - Send a reminder email via the standard email pipeline.
   - Record the reminder in `payment_reminders`.
2. **Settings UI** — per-conference toggle: "Send automated payment
   reminders". Default: off (opt-in).
3. **Email template** — `PAYMENT_REMINDER` template type with variables
   for invoice number, amount due, days overdue, and a payment link.

## Out of Scope

- SMS reminders.
- Configurable reminder cadence (use a fixed 3-day cooldown + 7/14/30
  day escalation milestones).
- Payment processing — reminders are notifications only.

## Spec

See `openspec/specs/` once implementation lands.
