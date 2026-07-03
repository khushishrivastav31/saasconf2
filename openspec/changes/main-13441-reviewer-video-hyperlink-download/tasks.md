# MAIN-13441: Tasks

> Frontend-only change (reusing existing backend download endpoints). No
> OpenAPI drift (no API changes). User-visible → handbook update required.

## Gate

- [ ] **STOP after writing this spec folder — wait for user review/approval,
      including confirming it's acceptable for the admin `PaperDetailModal`
      surface to get the same fix via shared-component extraction, before
      writing any test or implementation code.**

## RED — tests first

Frontend (`frontend/src/components/__tests__/VideoAttachmentLink.test.tsx`
or sibling to affected pages):
- [ ] Video renders as a hyperlink with `target="_blank"` and
      `rel="noopener noreferrer"`.
- [ ] A "Download" action triggers download of the correct attachment
      (mock the download endpoint call).
- [ ] Existing in-modal preview still opens and plays (no regression).
- [ ] Same behavior verified in both `AssignedPapersTab` and
      `EvaluatedPapersTab` (reviewer), and `PaperDetailModal` (admin).
- [ ] Run and confirm they fail for the right reason (no hyperlink/download
      exists yet).

## GREEN — implementation

- [ ] Confirm auth mechanism for the download endpoints (session/cookie vs.
      bearer header) per `design.md`'s open question — adjust the link
      approach (direct href vs. blob-with-download-attribute) accordingly.
- [ ] Extract shared `VideoAttachmentLink` component.
- [ ] Replace the duplicated blocks in all 3 locations with the shared
      component.
- [ ] Re-run targeted tests → green.

## REFACTOR

- [ ] Confirm no leftover dead code from the old duplicated blocks.

## Verify (full sweep)

- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `pnpm test`
- [ ] Manual check: click "Open video"/"Download" in both admin and reviewer
      contexts against a real uploaded video attachment.
- [ ] Update `frontend/src/pages/Handbook/handbookSections.tsx`.

## Ship

- [ ] Move this folder to `openspec/shipped/` in the same PR.
- [ ] Conventional commit `fix(cfp): add hyperlink and download for paper
      videos (MAIN-13441)`; PR per workflow, `--auto --squash` once green.
