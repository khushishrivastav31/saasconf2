# Tasks — Speaker outcome emails for deletion requests

## Phase 0 — Recon (done during planning)

- [x] Confirm `execute_privacy_erasure` sends no email to the subject.
- [x] Confirm `reject_privacy_request` sends no email to the subject.
- [x] Confirm `pr.subject_emails` is always populated for portal-initiated
      erasure requests (decrypted from `subject_email_hashes`).
- [x] Confirm Change 030 (admin email + pending badge) is fully shipped —
      no code duplication required.
- [ ] **Verify locally**: file an erasure request as a portal user → confirm
      admin email is delivered (i.e., Change 030 admin fix is live in dev).
      Document result (email_logs row or log line) before writing code.

## Phase 1 — Backend (TDD)

### RED — write failing tests first

- [ ] `test_execute_erasure_sends_speaker_email` — mock `send_email_background`;
      after a successful `POST /{id}/execute-erasure`, assert it was called
      with `send_privacy_erasure_completed` and the subject email.
- [ ] `test_reject_request_sends_speaker_email` — mock `send_email_background`;
      after `POST /{id}/reject`, assert it was called with
      `send_privacy_erasure_rejected` and the rejection reason in kwargs.
- [ ] `test_reject_email_contains_rejection_reason` — assert the rejection
      reason is threaded into the email body (unit-test the email function
      directly).
- [ ] Run tests → confirm they fail for the right reason (function not yet
      called).

### GREEN — minimum implementation

- [ ] Add `send_privacy_erasure_completed` to
      `backend/app/core/email/privacy.py`.
- [ ] Add `send_privacy_erasure_rejected` to
      `backend/app/core/email/privacy.py`.
- [ ] In `execute_privacy_erasure` (`privacy_requests.py`): after
      `await db.commit()`, loop over `pr.subject_emails` and call
      `send_email_background(send_privacy_erasure_completed, db,
      tenant_id=..., recipient_email=email, ...)`.
- [ ] In `reject_privacy_request` (`privacy_requests.py`): after
      `await db.commit()`, loop over `pr.subject_emails` and call
      `send_email_background(send_privacy_erasure_rejected, db,
      tenant_id=..., recipient_email=email, rejection_reason=...)`.
- [ ] Run targeted tests → all green.

### REFACTOR

- [ ] Ensure the two new email functions follow the same `escape()` /
      `send_email` pattern as `send_privacy_request_user_confirmation`.
- [ ] No duplication of tenant-name resolution — re-use the pattern from
      the existing functions (single `select(Tenant.name)` at the top).
- [ ] Tests stay green throughout.

## Phase 2 — Verify sweep (mandatory before PR)

- [ ] `cd backend && venv/bin/python -m pytest tests/test_privacy_requests_outcomes.py -v`
- [ ] `cd backend && venv/bin/python -m pytest tests/ -v` (full suite)
- [ ] `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `cd backend && ruff check app/ && ruff format --check app/`
- [ ] No frontend changes → no tsc / eslint / pnpm test required.
- [ ] No new endpoints, request/response schemas, or response codes →
      no OpenAPI regen required.
- [ ] Update handbook: `frontend/src/pages/Handbook/handbookSections.tsx`.

## Phase 3 — Ship

- [ ] Present commit message + PR title, ask once.
- [ ] On approval: commit, push, open PR with `--auto --squash`.
- [ ] After merge: move `openspec/changes/037-…` → `openspec/shipped/`.
