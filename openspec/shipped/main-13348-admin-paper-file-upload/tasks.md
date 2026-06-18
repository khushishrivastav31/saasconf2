# Tasks — MAIN-13348 admin paper file upload

## Backend — accept `paper_file` on admin endpoint

- [ ] RED: in `backend/tests/test_attachments.py`, assert an admin upload with
      `entity_type='paper_file'` (video bytes) succeeds; assert re-upload to the
      same `entity_id` + `description` leaves exactly one row, and a second
      `description` keeps two. Confirm they fail.
- [ ] GREEN: add `"paper_file"` to `ALLOWED_ENTITY_TYPES` in
      `app/api/v1/attachments.py`.
- [ ] GREEN: add the delete-existing-by-`(entity_id, description)` branch for
      `paper_file` in `upload_attachment`.
- [ ] REFACTOR: confirm no duplication with `cfp_portal/attachments.py`; other
      entity types' behaviour unchanged.

## Frontend — admin upload UI + save wiring

- [ ] RED: add `__tests__` for `PaperCustomField` — `file_upload` + `canEdit`
      renders a file input and `onFileSelect` fires on change; `!canEdit` stays
      read-only. Confirm they fail.
- [ ] GREEN: extend `PaperCustomFields.tsx` with `onFileSelect` /
      `pendingFileName` props and an editable file input for `file_upload`.
- [ ] GREEN: thread the props through `PaperFieldRenderer.tsx`.
- [ ] GREEN: in `PaperForm/index.tsx` hold `customFieldFiles` state, reset it on
      paper change, and pass it through the widened `onSave`.
- [ ] GREEN: in `CFPPapers/index.tsx` add `uploadPaperFiles` and call it from
      `handleCreate`/`handleUpdate`; merge `custom_field_answers` and invalidate
      queries. Upload failures non-fatal.
- [ ] REFACTOR: dedupe with `uploadVideo` where reasonable.

## Verify

- [ ] `cd backend && venv/bin/python -m pytest tests/test_attachments.py -v`
- [ ] `cd backend && venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `cd backend && ruff check app/ && ruff format --check app/`
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] Full sweep: `cd backend && venv/bin/python -m pytest tests/ -n 4 -q` and
      `cd frontend && pnpm test`
- [ ] OpenAPI drift: no endpoint signature changed — run `pnpm gen:api:check`
      to confirm (expect no output).
- [ ] Handbook: update `frontend/src/pages/Handbook/handbookSections.tsx` if the
      CFP paper file-upload behaviour is documented there.
- [ ] Manual: as admin at `?tab=cfp-papers`, create a paper, upload a video into
      a custom File upload field, save, reopen — file is attached and downloads.

## Ship

- [ ] Move `openspec/changes/main-13348-admin-paper-file-upload/` →
      `openspec/shipped/` in the same PR.
