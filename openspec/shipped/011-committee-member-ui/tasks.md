# Tasks — Committee Member Add + Topic Assignment UI

## Methodology: TDD (Red → Green → Refactor)

## Status Legend
- `[ ]` not started
- `[~]` in progress
- `[x]` done

---

## Phase 0 — Investigation

- [ ] Read `frontend/src/pages/modules/cfp/CFPProgramCommittee` (or
  wherever the component lives) to understand current state
- [ ] Check `conferenceSections.ts` for CFP sub-section entries — does
  "Program Committee" appear?
- [ ] Check backend for a committee-members endpoint:
  grep `committee` in `backend/app/api/v1/`
- [ ] Document what exists vs. what needs to be built

---

## Phase 1 — Navigation label / discoverability

### RED
- [ ] Write `CFPProgramCommittee.test.tsx` (or extend existing):
  - A navigation element with text "Program Committee" is rendered
  - Run → **expect failure** if label is wrong or missing

### GREEN
- [ ] Add or rename the CFP sidebar/tab entry to "Program Committee"
- [ ] Ensure the route correctly renders `CFPProgramCommittee`
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm the label is consistent with handbook section headings

---

## Phase 2 — Add member button

### RED
- [ ] Extend test:
  - A button labelled "Add member" or "Invite member" is visible
  - Clicking it opens a modal with an email input
  - Submitting the modal fires a POST mutation to the committee endpoint
  - Run → **expect failure** if button is absent or not prominent

### GREEN
- [ ] Add/promote the "Add member" button in `CFPProgramCommittee`
- [ ] Implement the invite modal (email + role select + submit)
- [ ] Wire the POST mutation; show toast on success/error
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm button uses primary style (`bg-blue-600` etc.) to be
  clearly actionable

---

## Phase 3 — Topic assignment

### RED
- [ ] Extend test:
  - Member row renders a topic multi-select or chip display
  - Selecting/deselecting topics fires a PATCH mutation
  - Run → **expect failure** if feature is absent

### GREEN
- [ ] Fetch topics from `GET /conferences/{id}/cfp/topics`
- [ ] Render topic multi-select per member row
- [ ] Wire PATCH mutation for topic assignment
- [ ] If the backend endpoint is missing, add it:
  `PATCH /conferences/{id}/committee/members/{member_id}/topics`
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Ensure multi-select is accessible (keyboard navigable, screen-reader labels)

---

## Phase 4 — Full sweep

- [ ] `cd backend && venv/bin/python -m pytest tests/cfp/ -v` (if backend changed)
- [ ] `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] `pnpm gen:api` if API schema changed
- [ ] Manual: navigate CFP → Program Committee → confirm reachable + labelled clearly
- [ ] Manual: add a committee member → confirm invite email in MailHog
- [ ] Manual: assign topics to a committee member → reload → confirm persisted
