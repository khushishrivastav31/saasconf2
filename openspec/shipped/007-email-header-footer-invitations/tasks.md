# Tasks — Email Header/Footer in Invitations + Template Editor Padding

## Methodology: TDD (Red → Green → Refactor)

## Status Legend
- `[ ]` not started
- `[~]` in progress
- `[x]` done

---

## Phase 0 — Call-site audit

- [ ] Grep for every call to `send_verification_email`, `send_user_invite_email`,
  `send_conference_team_invitation_email`, and any other invitation-type email
  function in `app/`
- [ ] For each call site, note whether `conference_id` is passed and whether
  it is available in the surrounding context
- [ ] Document findings as a table at the bottom of this file before Phase 1

---

## Phase 1 — Backend header/footer in verification email

### RED
- [ ] Write `tests/emails/test_invitation_header_footer.py`
  - Set up a conference with `email_header_html = '<p>Header</p>'` in settings
  - Call `render_email(db, APPLICANT_VERIFICATION, context, conference_id=conf.id)`
  - Assert rendered `body_html` contains `'<p>Header</p>'`
  - Call `render_email(db, APPLICANT_VERIFICATION, context, conference_id=None)`
  - Assert rendered `body_html` does NOT contain `'<p>Header</p>'`
  - Run → **expect**: first assertion may already pass if render_email is correct;
    second should pass too. This test validates the existing logic and detects regressions.
- [ ] Then write a test that calls `send_verification_email` without `conference_id`
  at a call site that HAS one available — assert header IS present after fix
  - Run → **expect failure** if call site omits conference_id

### GREEN
- [ ] Patch each call site identified in Phase 0 to pass `conference_id` where available
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] If multiple call sites share a common wrapper, extract the `conference_id`
  resolution into a helper to avoid repetition

---

## Phase 2 — Frontend template editor padding

### RED
- [ ] Write or extend `EmailTemplatesTab` test:
  - The editor wrapper element has `px-4` (or equivalent padding class) in its
    class list
  - Run → **expect failure**: wrapper has no padding

### GREEN
- [ ] In `EmailTemplatesTab.tsx`, add `px-4 py-2` to the editor wrapper div
- [ ] Run tests → **expect green**

### REFACTOR
- [ ] Confirm the change does not clip the editor toolbar or scroll bar

---

## Phase 3 — Full sweep

- [ ] `cd backend && venv/bin/python -m pytest tests/emails/ -v`
- [ ] `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `cd backend && ruff check app/ && ruff format --check app/`
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test`
- [ ] Manual: configure header HTML in Email Settings → trigger a verification
  email → check MailHog → confirm header appears in email body
- [ ] Manual: open Email Templates tab → confirm editor has visible L/R padding
