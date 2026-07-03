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

## Spec

See `openspec/specs/` once implementation lands.
