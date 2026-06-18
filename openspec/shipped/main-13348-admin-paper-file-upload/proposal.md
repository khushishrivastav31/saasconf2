# MAIN-13348 — Admin can't upload a file/video when creating a paper

## Problem

When an admin creates or edits a paper in the conference CFP Papers tab
(`/modules/conferences/{id}?tab=cfp-papers`), a custom **File upload** field
(`field_type === 'file_upload'`, e.g. the "File upload / DEscription" field in
the screenshot) renders **read-only**. It shows only "No file uploaded" or a
download link for an existing file — there is no file input, so the admin can
never attach a file (including a video) to that field.

The applicant **portal** supports this exact field: `SubmitPaperPage.tsx` /
`PaperEditForm.tsx` render a `<input type="file">`, collect the selected files in
`customFieldFiles`, and after saving the paper upload each one via
`POST /portal/attachments` with `entity_type='paper_file'` and
`description=<field_key>`. The admin side was never given the matching upload
path, so the capability is portal-only.

### Root cause — two gaps

**Frontend** — `PaperCustomFields.tsx` (`PaperCustomField`) only renders a
read-only view for `file_upload`. There is no `<input type="file">`, no state to
hold a pending `File`, and the admin save flow (`PaperForm/index.tsx` `onSave`
→ `CFPPapers/index.tsx` `handleCreate`/`handleUpdate`) only uploads the builtin
`paper_video`, never custom `paper_file` attachments. `onSave`'s signature
(`(data, videoFile)`) has no channel for custom-field files.

**Backend** — the admin attachments endpoint
(`backend/app/api/v1/attachments.py`) has `ALLOWED_ENTITY_TYPES` **without**
`"paper_file"`, so even a correctly-formed admin upload is rejected with
`Invalid entity_type 'paper_file'`. (The portal endpoint already allows it.)
The admin POST handler also lacks the portal's "replace existing attachment for
the same field_key" logic, so re-uploading to one field would accumulate orphan
rows.

`paper_file` already permits video MIMEs in `ALLOWED_MIME_TYPES`
(`file_validation.py`), so no MIME changes are needed — the entity type just has
to be accepted and wired into the admin UI.

## Proposed solution

Mirror the portal's proven `paper_file` flow on the admin side.

### Backend

1. Add `"paper_file"` to `ALLOWED_ENTITY_TYPES` in
   `backend/app/api/v1/attachments.py`.
2. In the admin upload handler, when `entity_type == "paper_file"`, delete any
   existing `paper_file` attachment for the same `entity_id` **and**
   `description` (the field key) before inserting — keeping one file per custom
   field, matching `cfp_portal/attachments.py`.

Authorization is unchanged: the endpoint already requires an authenticated
tenant user (`CurrentUserDep`) and scopes by `tenant_id`.

### Frontend

3. `PaperCustomFields.tsx` — when `canEdit`, render a `<input type="file">` for
   `file_upload` fields (accepting `validation_rules.allowed_file_types`),
   surface the selected filename as "pending upload" plus the existing file, and
   report the chosen `File` upward.
4. `PaperForm/index.tsx` — hold pending custom-field files in state
   (`Record<fieldKey, File>`) and pass them through `onSave`.
5. `CFPPapers/index.tsx` — after `handleCreate`/`handleUpdate` saves the paper,
   upload each pending file via `POST /attachments`
   (`entity_type='paper_file'`, `entity_id=paper.id`, `description=fieldKey`),
   then `PUT /cfp/papers/{id}` with the merged `custom_field_answers`
   (`{ attachment_id, filename }`) — the same two-step the portal performs.

## Impact

- Admins can attach files (videos, documents, images) to custom `file_upload`
  fields when creating or editing a draft paper, reaching parity with the
  portal.
- One additive backend entity type + a replace-by-field-key branch; no schema or
  migration changes.
- OpenAPI schema is unaffected (the attachments endpoint signature does not
  change — only the accepted `entity_type` value set).
- No change to portal behaviour or the builtin `paper_video` field.
