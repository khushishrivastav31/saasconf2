# MAIN-13441: Reviewer video download + hyperlink (new tab)

## Status
`draft` · Branch: _to be created on approval_ (`fix/reviewer-video-download-hyperlink`)

## Methodology
TDD — Red → Green → Refactor.

## Problem

Ticket: "A reviewer, I can not download the video in a paper, and the video
URL should be hyperlink (new tab)."

### Recon findings (2026-07-02)

- Video is not a `CFPPaper` column — it's an `Attachment`, surfaced as
  `video_url` in schemas (`backend/app/schemas/cfp_portal.py:112,268,409`,
  `backend/app/schemas/cfp_papers.py:215`) via helper `_get_paper_video_url`
  (`backend/app/api/v1/cfp_portal/shared.py:51-53`).
- Real download endpoints **already exist**:
  `backend/app/api/v1/attachments.py:191-192` (`download_attachment`, admin)
  and `backend/app/api/v1/cfp_portal/attachments.py:110-111`
  (`download_portal_attachment`, portal) — the backend capability is not
  missing, only its exposure in the reviewer UI.
- Current frontend rendering (confirmed no download/hyperlink today):
  `useAuthMedia.ts`/`usePortalAuthMedia` fetch the video as a blob and create
  an in-memory `URL.createObjectURL` with no `download` attribute and no
  direct link. It's rendered as a clickable thumbnail opening
  `MediaPreviewModal.tsx` (`<video controls autoPlay>`, lines 84-93) — a
  preview player, not a hyperlink, not downloadable.
- This identical pattern appears in **three** places:
  `CFPAssignments/PaperDetailModal.tsx:176-221` (admin),
  `AssignedPapersTab.tsx:199-248` and `EvaluatedPapersTab.tsx:147-192`
  (reviewer portal). Ticket only mentions reviewer, but fixing the shared
  rendering logic naturally fixes all three (see design.md) — flagging so
  the admin surface's incidental fix isn't a surprise in review.

## Proposed Change

1. Add an explicit hyperlink next to (or instead of) the thumbnail/preview
   trigger: `<a href={videoUrl} target="_blank" rel="noopener noreferrer">`
   opening the video in a new tab.
2. Add a working "Download" affordance that hits the existing
   `download_portal_attachment` endpoint (portal) /
   `download_attachment` endpoint (admin), rather than trying to force a
   download off the blob-preview URL (blob URLs don't carry a meaningful
   filename/don't survive tab navigation reliably).
3. Since the blob+modal preview pattern is duplicated across 3 components,
   extract a small shared `VideoAttachmentLink` (or similar) component
   used by `AssignedPapersTab`, `EvaluatedPapersTab`, and
   `PaperDetailModal` — avoids fixing the bug in 2 of 3 places and missing
   the third down the line.
4. Keep the existing in-modal preview player as-is (not being removed) —
   this adds a hyperlink/download option alongside it, per the ticket's
   wording ("can not download... URL should be hyperlink"), not a
   replacement of the preview UX.

## Out of Scope

- Changing how videos are uploaded or stored.
- Building a new attachment/download subsystem — reusing what exists.

## Acceptance Criteria

- In the reviewer portal (`AssignedPapersTab`, `EvaluatedPapersTab`), the
  video URL renders as a real hyperlink that opens in a new tab.
- A "Download" action successfully downloads the video file via the existing
  attachment endpoints.
- The existing in-modal video preview still works (no regression).
- Admin's `PaperDetailModal` gets the same fix as a natural consequence of
  sharing the extracted component (confirm this is acceptable scope in
  review, since the ticket only names "reviewer").

## Addendum — additional issues folded in during implementation (2026-07-07)

User testing surfaced three closely-related gaps that were fixed in the same
PR (user-approved expanding scope):

1. **Reviewer custom-field file download.** File uploads on custom paper
   fields rendered to reviewers as plain text `📎 <filename>` with no way to
   download. The answer value already carries `attachment_id`, so a new
   `CustomFieldFileDownload` component fetches
   `/portal/attachments/{attachment_id}/download` via the authenticated portal
   API. Frontend-only; `AssignedPapersTab` is the only reviewer surface that
   renders these fields.
2. **Admin video upload failed silently.** `handleCreate`/`handleUpdate` in
   `CFPPapers/index.tsx` swallowed `uploadVideo`/`uploadPaperFiles` errors with
   empty `catch {}` blocks, so a rejected upload produced no feedback. Extracted
   a testable `uploadPaperMedia` helper that collects per-upload error messages
   and surfaces them in the paper form's error banner.
3. **MKV rejected despite being advertised.** The upload UI offers `.mkv`, but
   the backend `paper_video` / `applicant_video` / `portal_user_video`
   allow-lists omitted `video/x-matroska`, so MKV uploads 400'd (and — per #2 —
   silently). Added `video/x-matroska` to those sets in
   `app/core/file_validation.py`. Validation-only change, no request/response
   schema change → no OpenAPI drift.

## Addendum 2 — video upload blocked by request-size limit (2026-07-08)

Manual testing of the admin video upload surfaced the actual root cause behind
"nothing worked": uploads over 10MB were rejected by
`RequestSizeLimitMiddleware`, whose body cap was hardcoded to 10MB while the UI
advertises 50MB videos. Because that middleware runs *outside* `CORSMiddleware`
and short-circuits with a bare `JSONResponse(413)`, the rejection carried no
CORS headers, so the browser reported it as an opaque CORS/Network error.

Fixes:

1. `settings.MAX_UPLOAD_SIZE_MB` default raised 10 → 50 to match the advertised
   video limit (the per-file endpoint cap, previously also 10MB, blocked large
   videos even if the middleware passed them).
2. `RequestSizeLimitMiddleware` now sizes its body cap off
   `MAX_UPLOAD_SIZE_MB` (+1MB multipart overhead) instead of a hardcoded 10MB,
   and returns its 413 through `_cors_response` so over-limit rejections are a
   clean error rather than a CORS wall.
3. `.env.example` documents `MAX_UPLOAD_SIZE_MB`.
4. Frontend: the admin paper form scrolls its error banner into view on a
   failed submit (the banner sits at the top of a long form and was missed
   below the fold).

Config/validation change only — no endpoint or schema change, no OpenAPI drift.

## Spec

See `openspec/specs/` once implementation lands.
