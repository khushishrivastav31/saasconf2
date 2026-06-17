# Tasks — Confirm before anonymizing a speaker

## Phase 0 — Recon (done during planning)

- [x] Confirm "Anonymize Speaker" button calls `onAnonymize()` directly on
      first click (`SpeakerDeleteDialog.tsx`), with no confirm step.
- [x] Confirm "Delete Speaker & Papers" routes through a `confirm-cascade` step
      (the pattern to mirror).
- [x] Confirm anonymization is irreversible (personal data overwritten with
      "Deleted User").
- [x] Confirm no backend/schema/handbook change is required.

## Phase 1 — Frontend (TDD)

### RED
- [ ] Test: clicking "Anonymize Speaker" does **not** call `onAnonymize` yet —
      it shows the confirm step instead.
- [ ] Test: the confirm-anonymize step shows the summary/warning text and
      Back / Anonymize buttons.
- [ ] Test: clicking the final "Anonymize Speaker" button calls `onAnonymize`.
- [ ] Test: "Back" returns to the choose step without calling `onAnonymize`.
- [ ] Test: cascade flow still works (regression guard).

### GREEN
- [ ] Add `'confirm-anonymize'` to the `step` state union.
- [ ] Anonymize button sets `step = 'confirm-anonymize'` instead of calling
      `onAnonymize()`.
- [ ] Render the confirm-anonymize step (summary + warning + Back / Anonymize).

### REFACTOR
- [ ] Keep the confirm-anonymize markup consistent with confirm-cascade; no
      behaviour change.

## Phase 2 — Verify sweep (mandatory before PR)

- [ ] `cd frontend && pnpm exec vitest run src/pages/modules/cfp/CFPApplicants/__tests__/SpeakerDeleteDialog.test.tsx`
- [ ] `cd frontend && pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `cd frontend && pnpm test` (full)
- [ ] No backend change → no pytest/mypy/ruff/OpenAPI regen required.

## Phase 3 — Ship

- [ ] Present commit message + PR title, ask once.
- [ ] On approval: commit, push, open PR with `--auto --squash`.
- [ ] After merge: move `openspec/changes/036-…` → `openspec/shipped/`.
