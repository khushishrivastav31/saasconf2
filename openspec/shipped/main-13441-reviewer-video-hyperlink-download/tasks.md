# MAIN-13441: Tasks

> Frontend-only change (reusing existing backend download endpoints). No
> OpenAPI drift (no API changes). User-visible → handbook update required.

## Gate

- [x] **STOP after writing this spec folder — wait for user review/approval,
      including confirming it's acceptable for the admin `PaperDetailModal`
      surface to get the same fix via shared-component extraction, before
      writing any test or implementation code.**

## RED — tests first

Frontend (`frontend/src/components/__tests__/VideoAttachmentLink.test.tsx`
or sibling to affected pages):
- [x] Video renders as a hyperlink with `target="_blank"` and
      `rel="noopener noreferrer"`.
- [x] A "Download" action triggers download of the correct attachment
      (mock the download endpoint call).
- [x] Existing in-modal preview still opens and plays (no regression).
- [x] Same behavior verified in both `AssignedPapersTab` and
      `EvaluatedPapersTab` (reviewer), and `PaperDetailModal` (admin).
- [x] Run and confirm they fail for the right reason (no hyperlink/download
      exists yet).

## GREEN — implementation

- [x] Confirm auth mechanism for the download endpoints (session/cookie vs.
      bearer header) per `design.md`'s open question — adjust the link
      approach (direct href vs. blob-with-download-attribute) accordingly.
- [x] Extract shared `VideoAttachmentLink` component.
- [x] Replace the duplicated blocks in all 3 locations with the shared
      component.
- [x] Re-run targeted tests → green.

## REFACTOR

- [x] Confirm no leftover dead code from the old duplicated blocks.

## Verify (full sweep)

- [x] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [x] `pnpm test`
- [x] Manual check: click "Open video"/"Download" in both admin and reviewer
      contexts against a real uploaded video attachment.
- [x] Update `frontend/src/pages/Handbook/handbookSections.tsx`.

## Ship

- [x] Move this folder to `openspec/shipped/` in the same PR.
- [x] Conventional commit `fix(cfp): add hyperlink and download for paper
      videos (MAIN-13441)`; PR per workflow, `--auto --squash` once green.
