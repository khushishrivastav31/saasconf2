# Tasks — Gate co-speakers + actions behind an open CFP on the paper submission form

## Phase 0 — Recon (done during planning)

- [x] Confirm co-speakers section (`SubmitPaperPage.tsx`) renders outside the
      `selectedCfpId` guard, so it shows before/without an open CFP.
- [x] Confirm the action row (Cancel + "Save as Draft") renders
      unconditionally.
- [x] Confirm dynamic form fields are already gated on `selectedCfpId`
      (the guard to reuse).
- [x] Confirm `selectedCfpId` is auto-set only from `availableCfps` (open CFPs,
      or any CFP for out-of-timeframe submitters) — the correct "CFP is open"
      signal.
- [x] Confirm no backend/schema/handbook change is required.

## Phase 1 — Frontend (TDD)

### RED
- [x] Test: before a conference is selected, the *Co-speakers* section and the
      Cancel / primary buttons are **not** rendered.
- [x] Test: when the selected conference has no open CFP
      ("No open CFPs for this conference."), no co-speakers section and no
      buttons render.
- [x] Test: after selecting a conference with an open CFP, the *Co-speakers*
      section and the **Next step** + Cancel buttons render.
- [x] Update existing co-speaker-management tests to select a conference/CFP
      first (they currently rely on the section showing at initial render).
- [x] Update submission tests to click **Next step** instead of *Save as Draft*;
      remove the now-unreachable "submit without selecting a conference" test.

### GREEN
- [x] Wrap the *Co-speakers* section in `{selectedCfpId && ( … )}`.
- [x] Wrap the actions row in `{selectedCfpId && ( … )}`.
- [x] Rename the idle primary-button label from *Save as Draft* to *Next step*
      (keep the *Saving…* pending label).

### REFACTOR
- [x] Sections kept under their own `selectedCfpId` guards (matching the
      existing form-field guard); no behaviour change.

## Phase 2 — Verify sweep (mandatory before PR)

- [x] `cd frontend && pnpm exec vitest run src/pages/portal/__tests__/SubmitPaperPage.test.tsx` — 20 passed
- [x] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/` — 0 errors (pre-existing warnings only)
- [x] `cd frontend && pnpm test` (full) — 2143 passed
- [x] No backend change → no pytest/mypy/ruff/OpenAPI regen required.

## Phase 3 — Ship

- [ ] Present commit message + PR title, ask once.
- [ ] On approval: commit, push, open PR with `--auto --squash`.
- [ ] After merge: move `openspec/changes/033-…` → `openspec/shipped/`.
