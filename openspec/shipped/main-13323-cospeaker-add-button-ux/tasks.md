# Tasks — MAIN-13323

## RED
- [ ] `SubmitPaperPage.test.tsx`: typing a first name/email gives the **Add**
      button the primary/blue class; empty fields keep it grey.
- [ ] `SubmitPaperPage.test.tsx`: with text typed but **Add** not pressed,
      clicking **Next step / Submit** shows the unadded-co-speaker error and does
      NOT call the create API.
- [ ] `PaperDetailPage.test.tsx`: with text typed but **Add** not pressed,
      clicking **Save Changes** shows the error and does NOT call the update API.
- [ ] `PaperDetailPage.test.tsx`: **Add** button turns blue when typing.
- [ ] Run targeted tests; confirm they fail for the right reason.

## GREEN
- [ ] `SubmitPaperPage.tsx`: derive `canAddCospeaker`; apply blue class; add the
      unadded-input guard at the top of `handleSubmit`.
- [ ] `PaperEditForm.tsx`: derive the actionable flag from existing props; apply
      blue class to **Add**.
- [ ] `PaperDetailPage.tsx`: add the unadded-input guard at the top of
      `handleSave`.
- [ ] Re-run targeted tests; confirm green.

## REFACTOR
- [ ] Share the message constant; confirm no duplicated literals; tidy class
      composition.

## VERIFY
- [ ] `pnpm exec tsc --noEmit && pnpm exec eslint src/`
- [ ] `pnpm test` (full frontend suite)
- [ ] No backend change → no `pytest` / `mypy` / `ruff` needed.
- [ ] No endpoint/schema change → `pnpm gen:api:check` clean (no regen).
- [ ] Update the in-app handbook if the co-speaker copy needs it.

## SHIP
- [ ] Move this folder to `openspec/shipped/` in the same PR.
