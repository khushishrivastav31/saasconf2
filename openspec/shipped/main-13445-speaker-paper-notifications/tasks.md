# MAIN-13445: Tasks

> Backend: new column (migration) + notification trigger. Frontend: deep-link
> button + speaker preview surface. Touches paper status-update response/
> behavior → confirm whether response schema changes (likely not — trigger is a
> side effect) → **OpenAPI regen only if a new endpoint/field is added** (e.g.
> the speaker preview endpoint). User-visible → handbook update required.

## Gate

- [x] **Reviewed/approved by user (2026-07-03).** Timing confirmed:
      immediate-on-decision, with `notification_sent_at` dedup against the
      existing publish-time flow.

## RED — tests first

Backend (`backend/tests/test_cfp_paper_notifications.py`):
- [x] Accepting a paper via `update_paper` sends exactly one
      `PAPER_ACCEPTANCE` notification to the speaker.
- [x] Rejecting a paper sends exactly one `PAPER_REJECTION` notification.
- [x] A paper already notified (via publish-time flow) is not re-notified by
      `update_paper`.
- [x] Tenant's custom template overrides the default in the sent content.
- [x] Speaker feedback text is interpolated when present.
- [x] New speaker-preview endpoint (if added) returns the same rendered content
      that was actually sent.
- [x] Run and confirm they fail for the right reason (no trigger exists yet).

Frontend:
- [x] Deep-link button on evaluated-papers view navigates to
      `EmailTemplatesTab` pre-filtered to the correct template type.
- [x] Speaker portal shows rendered notification content for an
      accepted/rejected paper.

## GREEN — implementation

- [x] Migration: add `CFPPaper.notification_sent_at: datetime | None`.
- [x] Trigger notification send in `update_paper` on accept/reject transitions,
      guarded by the dedup check.
- [x] Confirm/wire actual outbound email send (match existing transactional
      email pattern in `app/core/email/`).
- [x] Update publish-time flow (`program/publish.py`) to set/check the same
      dedup field.
- [x] Add deep-link button + `EmailTemplatesTab` URL-param pre-filter.
- [x] Add speaker-portal preview surface + backing endpoint.
- [x] Re-run targeted tests → green.

## REFACTOR

- [x] Ensure the notification-send logic isn't duplicated between
      `update_paper` and `publish.py` — extract a shared helper.

## Verify (full sweep)

- [x] `venv/bin/python -m pytest tests/test_cfp_paper_notifications.py -v`
- [x] `venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [x] `ruff check app/ && ruff format --check app/`
- [x] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [x] Full sweep: backend `pytest tests/ -n 4 -q`, frontend `pnpm test`
- [x] If new endpoint added: `pnpm gen:api` + `pnpm gen:api:check` clean.
- [x] Update `frontend/src/pages/Handbook/handbookSections.tsx`.

## Ship

- [x] Move this folder to `openspec/shipped/` in the same PR.
- [x] Conventional commit `feat(cfp): notify speakers on paper accept/reject
      with template deep-link (MAIN-13445)`; PR per workflow, `--auto --squash`
      once green.
