# Tasks — main-13385 committee-member create crashes with Excluded Topics

## Phase 0 — Recon (done during planning)
- [x] Reproduce: `POST /api/v1/cfp/committee-members` with `topic_ids` raises
      `MissingGreenlet`; same call without topics succeeds.
- [x] Pinpoint crash at `committee.py:237` `member.topics = list(...)` via full
      traceback.
- [x] Confirm `CFPCommitteeMember.topics` is `lazy="selectin"` over the
      `cfp_committee_member_topics` secondary table (`models/cfp.py:263`).
- [x] Confirm assignment to the unloaded collection on a post-flush persistent
      object triggers a sync lazy load → the error.
- [x] Confirm `update_committee_member` is unaffected (loads member via
      `db.execute`, so selectin pre-populates `topics`).
- [x] Confirm no existing test passes `topic_ids` on create.

## Phase 1 — Backend fix (TDD)

### RED — write failing tests first
- [ ] `TestCommitteeMembers::test_create_committee_member_with_topics`
      (link-existing applicant): POST with `topic_ids=[topic.id]` → expect 201,
      `len(data["topics"]) == 1`, correct topic id. Run → confirm it 500s with
      MissingGreenlet for the right reason.
- [ ] `test_create_committee_member_new_user_with_topics` (inline new applicant):
      POST with name/email/password + `topic_ids` → expect 201 with topics.
      Run → confirm it fails.

### GREEN — minimum implementation
- [ ] In `create_committee_member`, resolve `CFPTopic` rows **before**
      constructing the member and pass `topics=topics` into the
      `CFPCommitteeMember(...)` constructor (Option 1 in design.md). Remove the
      post-flush `member.topics = ...` assignment.
- [ ] Re-run the two new tests → green.

### REFACTOR
- [ ] Tidy naming/comments; keep the post-commit `selectinload` re-fetch intact.
      Confirm no behavioural change.

## Phase 2 — Regression guards
- [ ] Keep/verify a create-with-no-topics test → 201, `topics == []`.
- [ ] Add/verify an update-with-`topic_ids` test → 200 with topics set.

## Phase 3 — Verify sweep (per CLAUDE.md)
- [ ] `venv/bin/python -m pytest tests/cfp/test_cfp.py -v` (targeted).
- [ ] `venv/bin/python -m mypy app/ --config-file=pyproject.toml`.
- [ ] `ruff check app/ && ruff format --check app/`.
- [ ] Full backend sweep: `venv/bin/python -m pytest tests/ -n 4 -q`.
- [ ] No OpenAPI drift expected (no contract change) — confirm
      `pnpm gen:api:check` is clean (response shape unchanged).
- [ ] No frontend change; no handbook change (no user-visible UI change).

## Phase 4 — Ship
- [ ] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Present commit message + PR title for approval; merge with `--auto`.
