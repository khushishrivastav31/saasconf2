# Tasks — MAIN-13323 (invite link → set-password)

## RED
- [ ] `test_cfp_portal_papers_deep.py`: existing `CFPApplicant` linked to a
      `PortalUser` with **no** password, added as a co-speaker →
      `send_email_background` called once with `setup_token` **not None**.
- [ ] `test_cfp_portal_papers_deep.py`: existing applicant **with** a password
      (e.g. `second_applicant`) added as a co-speaker → `setup_token` is None.
- [ ] Run targeted tests; confirm they fail for the right reason (existing
      passwordless co-speaker currently gets `setup_token=None`).

## GREEN
- [ ] `portal_user_auto_creation.py`: add `ensure_cospeaker_setup_token(db, applicant)`.
- [ ] `_helpers.py` `_sync_cospeakers`: in the new-co-speaker-record branch, when
      `setup_token is None`, compute it via `ensure_cospeaker_setup_token`.
- [ ] Re-run targeted tests; confirm green.

## REFACTOR
- [ ] Confirm no duplicated token-issuance logic between
      `provision_cospeaker_applicant` and the new helper (share `_create_setup_token`).
- [ ] Tidy imports / naming.

## VERIFY
- [ ] `cd backend && venv/bin/python -m pytest tests/cfp_portal/test_cfp_portal_papers_deep.py -v`
- [ ] `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `cd backend && ruff check app/ && ruff format --check app/`
- [ ] Full backend sweep: `cd backend && venv/bin/python -m pytest tests/ -n 4 -q`
- [ ] No endpoint/schema change → no `pnpm gen:api` regen needed.
- [ ] No user-visible UI change → handbook untouched.

## SHIP
- [ ] Move this folder to `openspec/shipped/` in the same PR.
