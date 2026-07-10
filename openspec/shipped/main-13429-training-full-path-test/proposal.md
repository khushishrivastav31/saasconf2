# MAIN-13429: Full path to test the Training module

## Status
`draft` · Branch: `docs/training-full-path-test`

## Problem

Ticket title: "Create the full path to test the Training module." No description,
no acceptance criteria.

The Conference module has `QA_CONFERENCE.md` at the repo root — a QA runbook with
test-user credentials, numbered scenarios, status labels (`RETEST` / `FAIL` /
`BLOCKED` / `SKIP`), and step-by-step walkthroughs ending in an **Expected:**
line. The Training module has no equivalent, despite spanning nine Handbook
categories, a public registration portal, two invoicing entry points, and an
attendee lifecycle that moves money between invoices.

## Proposed Change

Add `QA_TRAINING.md` at the repo root, mirroring `QA_CONFERENCE.md`'s format:

- Test-user table with real credentials, plus key URLs (admin, public portal,
  attendee portal, MailHog).
- Numbered sections 0–10, ordered by **prerequisite**, not by Handbook display
  order — the Handbook presents Training Program before Settings, but a program
  year needs a training, a location, and a trainer, all of which live in
  Settings.
- Scenario tables (`# | Scenario | Status`), every row starting at `Not tested`.
- Step-by-step walkthroughs for the load-bearing flows: publish the program year,
  register through the portal, mark paid, cancel vs replace, park, reassign,
  cancel registration, bulk cancel.

## Design notes carried into the doc

Grounding the runbook against the implementation surfaced three things that will
read as bugs to a tester and are not. All three are called out in a "Read this
before you start" block:

- Public registration is rate-limited to **3/hour/IP**, skipped only when
  `DEBUG=true` (`app/core/security/registrations.py:131`).
- The form rejects submissions made **under 5 seconds** after load.
- **Portal registrations never produce a `Draft` invoice** — the invoice is
  created at `sent`, or at `paid` for card payments with a `payment_intent_id`
  (`app/core/training_invoice_generation.py:91`).

Plus the ambiguous 404: `POST /portal/{slug}/trainings/register` returns an
identical `"Training not found or not available for registration"` for six
distinct causes (wrong tenant, non-public placement type, past start date,
unpublished program year, inactive training, bad id). §4.1 enumerates all six.

## What this is not

- **Not automated test code.** No pytest, no Playwright. An env-gated Playwright
  spec was considered and deferred — it would not run in CI without a seeded
  target.
- **Not a Handbook edit.** Three Handbook inaccuracies were found; they are
  recorded at the foot of `QA_TRAINING.md` and filed as follow-ups.

## Recon corrections

The earlier draft of this proposal (2026-07-02) asserted things the code does not
do:

- Portal registration does not create a `draft` invoice, so the earlier design's
  step 3 ("`TrainingInvoice` created (status=draft)") and step 4 ("send invoice")
  did not describe real transitions on this path.
- The park → reassign → credit-note → re-invoice tail is **already covered** by
  `test_training_attendee_reassign.py::test_reassign_without_keep_invoice_still_cancels_and_reissues`
  and by `backend/tests/invoices/test_training_invoice_no_refund.py` — the latter
  never mentioned in the earlier recon, though a sibling test's docstring names
  it as the happy-path owner.
- `test_training_finance.py` lives in `backend/tests/invoices/`, not
  `backend/tests/trainings/`.

## Acceptance Criteria

- `QA_TRAINING.md` exists at the repo root and follows `QA_CONFERENCE.md`'s
  conventions: status labels, test-user table, numbered scenarios, **Expected:**
  lines.
- A tester can follow it top to bottom; no step depends on a later one.
- Every scenario ships at `Not tested` — no fabricated pass/fail results.
- Navigation steps name real sidebar entries (verified against
  `frontend/src/pages/Trainings/trainingSections.ts`) and real routes (verified
  against `frontend/src/App.tsx`).
- Behavioural claims are grounded in the implementation.

## Out of Scope

- Automating the path. See `design.md` for where to start — the untested seam is
  registration → invoice.
- Editing Handbook copy to fix the three recorded inaccuracies.
- Removing the unreachable honeypot branch at
  `app/api/v1/portal/training_portal/registration.py:151`.
- Load and performance testing.
