# MAIN-13429: Design

## Scenario outline (backend integration test)

```
1. Create TrainingProgramYear (fixture tenant)
2. Create ProgramYearTraining (Training + Location + PlacementTrainer→Trainer)
3. Simulate public portal registration (POST to the same endpoint
   frontend portal form calls) →
   - TrainingRegistration created
   - TrainingRegistrationAttendee → TrainingAttendee created
   - TrainingInvoice created (status=draft)
4. Send invoice (mock Stripe payment link creation — don't call real Stripe)
5. Mark invoice paid (simulate webhook or admin "mark paid" action)
6. Park the attendee (TrainingAttendeeHistory entry created)
7. Reassign attendee to a second ProgramYearTraining placement
   - Old invoice cancelled
   - Credit note auto-issued (per existing park/reassign logic)
   - New invoice created for the new placement
8. Assertions at each step boundary, not just at the end — so a break in step 4
   is reported as a step-4 failure, not an opaque final-assertion mismatch.
```

Model fixture setup after `test_offer_acceptance.py`'s pattern for creating
program/placement/trainer scaffolding; model the park/reassign portion after
`test_training_attendee_reassign.py`'s existing assertions on credit notes.

## Why one chained test, not N independent tests

Each step's precondition is the previous step's real output (real attendee id,
real invoice id) — stubbing between steps would test the stub, not the actual
integration. A single ordered scenario (or a test class with `pytest` fixtures
scoped to build up shared state) catches integration seams that isolated unit
tests structurally cannot.

## Frontend e2e — env gating

Follow `public-registration.spec.ts`'s convention:
```ts
test.skip(!process.env.E2E_TRAINING_SLUG, 'requires E2E_TRAINING_SLUG');
```
This keeps the spec out of default CI runs (which don't have a seeded
staging target) while making it runnable on demand against a real environment,
consistent with how the existing public-registration full-flow spec works.

## Page object extension

`frontend/e2e/pages/training.page.ts` currently only has navigation helpers.
Add, following the existing method style in that file:
- `createProgramYear(...)`
- `createPlacement(...)`
- `fillPublicRegistrationForm(...)`
- `parkAttendee(...)` / `reassignAttendee(...)`
- assertion helpers for invoice status/count

## Stripe / payment simulation

Neither the backend test nor the e2e spec should hit real Stripe. Backend test
mocks the payment-link creation call (pattern already used elsewhere in
`test_training_finance.py` or invoice tests — reuse whatever mock/fixture
exists for Stripe calls rather than introducing a new mocking approach).
