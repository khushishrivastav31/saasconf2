# MAIN-13429: Design

## Why the Handbook is the backbone

The Handbook (`frontend/src/pages/Handbook/sections/`) is already the
tenant-facing description of what the Training module does, maintained alongside
the code — CLAUDE.md requires updating it for any user-visible change. It is
therefore the closest thing to a behavioural spec the module has, and anchoring
the test path to it means the path stays honest as the module changes: a new
Handbook section is a new step to cover.

Nine categories, in Handbook display order: Introduction, Training Program,
Customers & Offers, Operations, Communications, Insights, Settings, DSGVO
Compliance, Appendix.

## Why the test path re-orders it

Handbook order is not runnable. It presents *Training Program* (category 2)
before *Settings* (category 7), but a program year needs a training from the
catalog, a location, and a trainer — all of which live in Settings. Likewise
*Operations → Invoices* names Finance settings as a prerequisite.

So the path inverts to dependency order:

```
Finance settings        →  invoices can be numbered and rendered
Catalog + reference     →  trainings, syllabi, locations, trainers exist
Program year + publish  →  placements become visible to the portal
Public registration     →  registration + attendee + invoice come into being
Invoicing               →  send, pay, cancel, credit-note, replace
Attendee lifecycle      →  park, reassign, cancel, reactivate, bulk cancel
B2B offers              →  the parallel entry into the same machinery
Surrounding surfaces    →  comms, insights, users, DSGVO
```

`QA_TRAINING.md` sections 0–10 follow that dependency order, so a tester can run
it top to bottom without ever depending on a later step.

## Grounding claims in code

Where the path asserts a specific observable outcome, it was verified against the
implementation rather than inferred from the Handbook. The load-bearing ones:

| Claim | Source |
| --- | --- |
| Invoice created `sent`, or `paid` for card + `payment_intent_id` — never `draft` | `app/core/training_invoice_generation.py:91` |
| Invoice creation is idempotent per registration | `training_invoice_generation.py` (early return on existing) |
| Six conditions collapse into one 404 | `app/api/v1/portal/training_portal/registration.py:121-142` |
| Registration window returns 403 | `registration.py:106-118` |
| 0 attendees / >100 attendees → 422 | `registration.py:144-148` |
| Honeypot, <5s form time, disposable email → **400** | `app/core/security/registrations.py:110-128` |
| Rate limit 3/hour/IP, skipped when `DEBUG` | `security/registrations.py:131` |
| `mark-paid` endpoint exists | `app/api/v1/trainings/invoice_operations.py:282` |
| Attendee deduplicated by email | `app/core/training_attendee_resolver.py` |

The 404 case matters disproportionately: in production, "Training not found or
not available for registration" is returned for a wrong tenant, a non-public
placement type, a past start date, an unpublished program year, an inactive
training, *and* a bad id. A tester who does not know that will burn an afternoon
on it, so the path enumerates the six causes explicitly.

## Negative cases before the happy path

Phase 4 runs its negative cases first. Two reasons. The 404 and 400 responses are
cheap to trigger and tell you immediately whether your phase 1–3 setup is
actually correct — a 404 on a placement you believe is published means the
publish step silently failed. And once you have submitted a valid registration,
the rate limiter is one of your three attempts closer to firing.

## The two discrepancies, and why they are recorded rather than fixed

Grounding the path surfaced spots where the Handbook and the code disagree
(recorded at the foot of `QA_TRAINING.md`): the `Draft → Sent → Paid` lifecycle does not
describe the portal path, and "a Stripe payment link is created when the invoice
is sent" does not apply to portal card registrations, which are `paid` on
creation and never *sent*.

Both are Handbook wording problems, not code defects. The code is right and the
tests agree with it. Editing user-facing Handbook copy is a content decision with
its own review, so this change records the discrepancy where a tester will hit it
and leaves the copy alone. Same reasoning for the unreachable honeypot branch at
`registration.py:151` — the shipped behaviour is correct (400), and deleting dead
code inside a docs change would smuggle a code diff past a docs review.

## Deferred: automating the path

Existing backend coverage, inventoried while grounding the runbook, is already
substantial: `test_training_portal.py`, `test_training_attendee_reassign.py`,
`backend/tests/invoices/test_training_invoice_no_refund.py`,
`test_cancel_registration.py`, `test_bulk_cancel.py`, `test_offer_acceptance.py`,
and the `test_program_*.py` family. The finding worth carrying forward:
`test_training_portal.py` exercises the registration endpoint across ~1,650 lines
and never asserts on an invoice, while `test_training_invoice_no_refund.py`
builds its registration and paid invoice directly in the DB via fixture. Both
halves are tested; the join between them is not. Anything automated later should
start at that seam, not at a full eight-step chain that would mostly re-test
covered ground.

A Playwright spec (`E2E_TRAINING_SLUG`-gated, mirroring
`public-registration.spec.ts`) was considered and deferred — it cannot run in
default CI without a seeded target, and `frontend/e2e/pages/training.page.ts`
would need extending well beyond its current nav-only helpers.
