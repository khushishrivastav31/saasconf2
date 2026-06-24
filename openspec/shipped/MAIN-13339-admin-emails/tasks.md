# Tasks — MAIN-13339 Admin Emails

## Methodology: TDD (Red → Green → Refactor)

Each implementation step is preceded by a failing test. No implementation starts
without first seeing the test fail for the right reason.

## Status Legend
- `[ ]` not started
- `[~]` in progress
- `[x]` done

---

## Phase 1 — Backend: route speaker notifications to support email

### RED
- [ ] Write `tests/messaging/test_speaker_notification_to_support_email.py`
  - Happy path: applicant sends message; conference has `support_email` set → one call to
    `send_email_background` with `email=support_email`; no call with any admin user email
  - Fallback: `support_email` is blank, `contact_email` is set → one call with `email=contact_email`
  - Both blank: no call to `send_email_background` for the admin notification at all
  - Applicant participant on the thread still receives their own notification (unchanged)
  - Training thread: `"user"` participant still receives individual email (training is out of scope)
  - Run → **expect failure**: function currently emails each admin individually

### GREEN
- [ ] In `backend/app/api/v1/cfp_portal/messaging/_helpers.py`, update
  `_notify_other_participants()`:
  - When `domain == "conference"` and a `"user"`-type participant is encountered:
    - Do not send individual email; instead record that a support address is needed
  - After the participant loop (or before it), if `domain == "conference"` and
    `conference_id_for_email` is set:
    - `SELECT Conference WHERE id = conference_id_for_email`
    - `support_addr = conference.support_email or conference.contact_email`
    - If `support_addr`: call `send_email_background(send_new_message_notification, ..., email=support_addr, first_name="")`
  - `"applicant"` and `"training_attendee"` participants: no change
  - `domain == "training"` user participants: no change
- [ ] Run targeted tests → **expect green**

### REFACTOR
- [ ] Confirm the extra `SELECT Conference` is not a performance concern (low-frequency path)
- [ ] Ensure no dead code left from removed per-user email loop

---

## Phase 2 — Frontend: support email note in conference settings

### RED
- [ ] Locate the component rendering the Contact Information fields
  (Support Email, Contact Email, Phone) in `frontend/src/pages/`
- [ ] Write or update a test asserting the helper note text
  "Message notifications from speakers will be sent to this address."
  appears adjacent to the Support Email field
- [ ] Run → **expect failure**: note does not exist yet

### GREEN
- [ ] Add `<p className="text-xs text-gray-500 dark:text-dark-text-secondary mt-1">` note
  beneath the Support Email input in the conference settings Contact Information section
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm dark-mode variant renders correctly (visual check)
- [ ] Confirm note does not break responsive layout at narrow widths

---

## Phase 3 — Full sweep (all must be green before PR)

- [ ] `cd backend && venv/bin/python -m pytest tests/ -n 4 -q`
- [ ] `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `cd backend && ruff check app/ && ruff format --check app/`
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] `cd frontend && pnpm gen:api:check` — must print no output (no endpoint changes expected)
- [ ] Visual check: send a test message from portal; confirm only support_email receives notification
