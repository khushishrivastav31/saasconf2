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
- [ ] Accepting a paper via `update_paper` sends exactly one
      `PAPER_ACCEPTANCE` notification to the speaker.
- [ ] Rejecting a paper sends exactly one `PAPER_REJECTION` notification.
- [ ] A paper already notified (via publish-time flow) is not re-notified by
      `update_paper`.
- [ ] Tenant's custom template overrides the default in the sent content.
- [ ] Speaker feedback text is interpolated when present.
- [ ] New speaker-preview endpoint (if added) returns the same rendered content
      that was actually sent.
- [ ] Run and confirm they fail for the right reason (no trigger exists yet).

Frontend:
- [ ] Deep-link button on evaluated-papers view navigates to
      `EmailTemplatesTab` pre-filtered to the correct template type.
- [ ] Speaker portal shows rendered notification content for an
      accepted/rejected paper.

## GREEN — implementation

- [ ] Migration: add `CFPPaper.notification_sent_at: datetime | None`.
- [ ] Trigger notification send in `update_paper` on accept/reject transitions,
      guarded by the dedup check.
- [ ] Confirm/wire actual outbound email send (match existing transactional
      email pattern in `app/core/email/`).
- [ ] Update publish-time flow (`program/publish.py`) to set/check the same
      dedup field.
- [ ] Add deep-link button + `EmailTemplatesTab` URL-param pre-filter.
- [ ] Add speaker-portal preview surface + backing endpoint.
- [ ] Re-run targeted tests → green.

## REFACTOR

- [ ] Ensure the notification-send logic isn't duplicated between
      `update_paper` and `publish.py` — extract a shared helper.

## Verify (full sweep)

- [ ] `venv/bin/python -m pytest tests/test_cfp_paper_notifications.py -v`
- [ ] `venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `ruff check app/ && ruff format --check app/`
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] Full sweep: backend `pytest tests/ -n 4 -q`, frontend `pnpm test`
- [ ] If new endpoint added: `pnpm gen:api` + `pnpm gen:api:check` clean.
- [ ] Update `frontend/src/pages/Handbook/handbookSections.tsx`.

## Ship

- [ ] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit `feat(cfp): notify speakers on paper accept/reject
      with template deep-link (MAIN-13445)`; PR per workflow, `--auto --squash`
      once green.
