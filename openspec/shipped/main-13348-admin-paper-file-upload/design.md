# Design — MAIN-13348 admin paper file upload

## Current state

| Concern | Portal (works) | Admin (broken) |
| --- | --- | --- |
| Upload UI for `file_upload` | `SubmitPaperPage.tsx` / `PaperEditForm.tsx` render `<input type="file">` | `PaperCustomFields.tsx` read-only |
| Pending file state | `customFieldFiles: Record<string, File>` | none |
| Upload call | `POST /portal/attachments` `paper_file`, `description=field_key` | none (only `paper_video`) |
| Persist answer | `PUT /portal/papers/{id}` merge `custom_field_answers` | n/a |
| Endpoint accepts `paper_file` | `PORTAL_ALLOWED_ENTITY_TYPES` ✅ | `ALLOWED_ENTITY_TYPES` ❌ |
| Replace-by-field-key | yes (scopes delete by `description`) | no |

The stored answer shape is identical on both sides:
`{ attachment_id: string, filename: string }`, keyed by the custom field's
`field_key` inside `custom_field_answers`. The read-only admin renderer already
reads exactly that shape, so existing files keep displaying unchanged.

## Backend changes

`backend/app/api/v1/attachments.py`:

- Add `"paper_file"` to `ALLOWED_ENTITY_TYPES`.
- In `upload_attachment`, before constructing the new `Attachment`, add a
  delete-existing branch mirroring `cfp_portal/attachments.py`:

  ```python
  if entity_type == "paper_file":
      stmt = select(Attachment).where(
          Attachment.tenant_id == tenant_id,
          Attachment.entity_type == "paper_file",
          Attachment.entity_id == entity_id,
      )
      if description is not None:
          stmt = stmt.where(Attachment.description == description)
      for old in (await db.execute(stmt)).scalars().all():
          await db.delete(old)
  ```

  This keeps one attachment per `(paper, field_key)` and prevents orphan rows on
  re-upload. Other entity types are untouched (admin upload currently never
  replaces, and we don't change that for them).

MIME validation already covers `paper_file` videos/docs via
`ALLOWED_MIME_TYPES["paper_file"]`; no change there. Audit logging, size limit,
and `playback_content_type` on download all already apply to any entity type.

## Frontend changes

### `PaperCustomFields.tsx`

Extend `Props` with optional `onFileSelect?: (file: File | null) => void` and
`pendingFileName?: string | null` (same contract the portal `DynamicField`
uses). When `cf.field_type === 'file_upload'` **and** `canEdit`, render a
`<input type="file">` with `accept` built from
`cf.validation_rules?.allowed_file_types` (`.${t}` joined), plus the existing
read-only display (existing filename + download, pending filename badge). When
`!canEdit`, keep today's read-only rendering.

### `PaperForm/index.tsx`

- Add `const [customFieldFiles, setCustomFieldFiles] = useState<Record<string, File>>({})`.
- Clear it in the `reset`-on-paper-change effect.
- Pass a file-select handler + pending name down through `PaperFieldRenderer` →
  `PaperCustomField`.
- Change `onSave` prop type to
  `(data: PaperFormData, videoFile: File | null, customFieldFiles: Record<string, File>) => void`
  and pass `customFieldFiles` in `onFormValid`.

`PaperFieldRenderer.tsx` gets the two pass-through props for custom fields.

### `CFPPapers/index.tsx`

Add an `uploadPaperFiles` helper analogous to `uploadVideo`:

```ts
async function uploadPaperFiles(paper, files) {
  const answers = { ...(paper.custom_field_answers ?? {}) };
  for (const [fieldKey, file] of Object.entries(files)) {
    const form = new FormData();
    form.append('file', file);
    form.append('entity_type', 'paper_file');
    form.append('entity_id', paper.id);
    form.append('description', fieldKey);
    const resp = await api.post('/attachments', form, { headers: {...} });
    answers[fieldKey] = { attachment_id: resp.data.id, filename: resp.data.filename };
  }
  await api.put(`/cfp/papers/${paper.id}`, { custom_field_answers: answers });
}
```

Call it from `handleCreate` and `handleUpdate` (after the paper save, alongside
the existing `uploadVideo`), then invalidate `['cfp-papers']` /
`['assignment-papers']`. Upload failures are non-fatal (match the existing
video-upload `try/catch`), so a partial failure still saves the paper.

## Alternatives considered

- **Reuse the portal's `paper_file` endpoint from admin** — rejected: admin uses
  `CurrentUserDep`/tenant auth, not applicant auth; the existing
  `/attachments` admin endpoint is the right surface and already handles
  `paper_video` for this same form.
- **Single multipart create** — rejected: the paper must exist before an
  attachment can reference its `entity_id`; the two-step (create paper → upload
  → patch answers) is what the portal already does and what the read path
  expects.

## Test plan

Backend (`backend/tests/test_attachments.py`):
- Admin upload with `entity_type='paper_file'` succeeds (was 4xx before).
- Re-upload to the same `(paper, description)` replaces the prior row (count
  stays 1); different `description` keeps both.
- A non-`paper_file` admin upload still does **not** replace existing rows
  (regression guard).

Frontend (`PaperCustomFields` / form `__tests__`):
- `file_upload` + `canEdit` renders a file input; `!canEdit` stays read-only.
- Selecting a file calls `onFileSelect` and shows the pending filename.
