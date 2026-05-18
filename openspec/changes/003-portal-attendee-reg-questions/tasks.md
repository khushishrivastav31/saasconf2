# Tasks — Portal Attendee Registration Questions (Change 003)

## Methodology: TDD (Red → Green → Refactor)

## Status Legend
- `[ ]` not started
- `[~]` in progress
- `[x]` done

---

## Phase 1 — Migration: portal_user_id on RegistrationQuestionAnswer

### RED
- [ ] Write `tests/portal/test_attendee_question_answer_model.py`
  - Assert `RegistrationQuestionAnswer` accepts `portal_user_id`
  - Assert existing rows with `applicant_id` still work (no regression)
  - Run → **expect failure**: column does not exist

### GREEN
- [ ] Write migration `223_attendee_question_answers.py`
  - Add nullable `portal_user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE`
  - Add index `(portal_user_id, conference_id)`
- [ ] Add `portal_user_id: Mapped[uuid.UUID | None]` to `RegistrationQuestionAnswer` model
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm existing CFP answer tests still pass

---

## Phase 2 — Backend attendee endpoints

### RED
- [ ] Write `tests/portal/test_attendee_reg_questions.py`
  - GET pending → empty when no questions configured
  - GET pending → returns questions when conference has active questions
  - GET pending → empty when all questions already answered
  - POST answers → 200, answers stored with portal_user_id
  - POST answers → 400 when mandatory question missing
  - POST answers → idempotent on re-submit (upsert)
  - Run → **expect failure**: endpoints do not exist

### GREEN
- [ ] Create `app/api/v1/portal/attendee_questions.py` with both endpoints
- [ ] Register router in portal router
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Extract shared question-validation logic if duplication with CFP endpoint is clear

---

## Phase 3 — Frontend PortalLayout wiring

### RED
- [ ] Add/extend `PortalLayout.test.tsx`
  - When `is_conference_attendee=true` and mandatory questions pending →
    questionnaire gate renders
  - Pending query calls attendee endpoint (not CFP endpoint)
  - Run (`pnpm test`) → **expect failure**

### GREEN
- [ ] Change `enabled` condition in pending-questions query
- [ ] Make query URL conditional on `applicant` presence
- [ ] Pass correct submit URL to questionnaire component
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm CFP applicant gate path is unchanged

---

## Phase 4 — Full sweep

- [ ] `venv/bin/python -m pytest tests/ -v`
- [ ] `venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `ruff check app/ && ruff format --check app/`
- [ ] `pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `pnpm gen:api` + `pnpm gen:api:check`
- [ ] Manual: admin adds mandatory question → attendee logs in → sees gate →
      answers → gate dismissed → re-login → gate not shown ✓
