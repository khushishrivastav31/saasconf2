# MAIN-13429: Full end-to-end path test for the Training module

## Status
`draft` · Branch: _to be created on approval_ (`test/training-full-path`)

## Methodology
TDD in spirit, inverted: this ticket **is** the test-writing work — there is no
separate implementation to build first (see Acceptance Criteria). "Red" here means
confirming the full path is *not* currently covered end-to-end (true today per
recon), "Green" means the new test passing against existing app code as-is.

## Problem

Ticket has no description beyond the title: "Create the full path to test the
Training module." No JIRA acceptance criteria to work from — this proposal
defines the scope from the existing module architecture and test gaps.

### Recon findings (2026-07-02)

- Training module chain: `TrainingProgramYear` → `ProgramYearTraining`
  (placement, links `Training` + `Location` + `PlacementTrainer`→`Trainer`) →
  `TrainingRegistration` → `TrainingRegistrationAttendee`→`TrainingAttendee` +
  `TrainingInvoice`. Parallel B2B path: `CustomerOffer` → accept → generates
  `TrainingInvoice`. Attendee lifecycle: park → reassign → cancel/credit-note →
  re-invoice.
- Existing backend tests (`backend/tests/trainings/`, ~3,300+ lines across
  `test_trainings.py`, `test_program_year_trainings.py`,
  `test_training_portal.py`, `test_customer_offers.py`,
  `test_offer_acceptance.py`, `test_training_attendee_reassign.py`,
  `test_training_finance.py`, `test_portal_my_trainings_offers.py`) are all
  narrowly scoped — CRUD unit tests or single-feature tests. **No test chains
  program → placement → public portal registration → attendee creation →
  invoice → payment → park → reassign → credit note → new invoice into one
  scenario.**
- Closest existing multi-step pattern to model after:
  `test_offer_acceptance.py::test_accept_offer_promotes_all_attendees` (offer →
  accept → attendee promotion).
- Frontend e2e: Playwright config exists (`frontend/playwright.config.ts`),
  page-object pattern in `frontend/e2e/pages/` (`training.page.ts` — currently
  nav-only helpers). `frontend/e2e/trainings.spec.ts` only checks tab
  visibility, no data flow. `frontend/e2e/public-registration.spec.ts`
  demonstrates the repo's pattern for env-gated full-flow specs
  (`test.skip` if `E2E_CONFERENCE_SLUG` unset) — mirror with `E2E_TRAINING_SLUG`.

## Proposed Change

1. **Backend integration test** — new
   `backend/tests/trainings/test_training_full_path.py` chaining, in one test
   (or a small ordered class of tests sharing fixtures):
   `TrainingProgramYear` create → `ProgramYearTraining` (placement + trainer)
   create → public portal registration creates `TrainingAttendee` +
   `TrainingInvoice` (draft) → send invoice (mock Stripe payment link) → mark
   paid → park the attendee → reassign to a second placement → verify old
   invoice cancelled + credit note issued + new invoice created for the new
   placement.
2. **Frontend e2e spec** — new `frontend/e2e/training-full-path.spec.ts`,
   env-gated like `public-registration.spec.ts`, driving the same path through
   the UI: admin creates program year + placement → public portal registration
   form submission → admin sees attendee + invoice → (payment simulated via
   test mode) → park/reassign via admin UI → verify new invoice appears.
3. Extend `frontend/e2e/pages/training.page.ts` beyond nav helpers with the
   form-fill/assert methods the new spec needs, following the existing
   page-object pattern.
4. Do not attempt to cover the B2B `CustomerOffer` path in the same test — that
   flow already has decent coverage (`test_offer_acceptance.py`,
   `test_customer_offers.py`); this ticket's "full path" targets the
   more-common direct-registration path that currently has no end-to-end test.

## Out of Scope

- Rewriting/consolidating existing narrow unit tests — they stay as-is; this
  adds a complementary integration-level test, not a replacement.
- The B2B customer-offer full path (already reasonably covered).
- Load/performance testing of the training flow.

## Acceptance Criteria

- A new backend test exercises program-year → placement → registration →
  attendee → invoice → payment → park → reassign → credit-note → re-invoice as
  one continuous scenario, and passes against current application code
  unmodified (this ticket adds test coverage, not new features).
- A new Playwright spec drives the equivalent path through the actual UI,
  gated behind an env var so it doesn't run by default without a seeded
  staging/test target.
- If the full path reveals an actual bug (not just a coverage gap) while
  writing the test, that gets filed as a separate ticket rather than silently
  patched here — this ticket's job is coverage.

## Spec

See `openspec/specs/` once implementation lands.
