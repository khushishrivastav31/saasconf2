# Tasks — MAIN-13408

## RED (tests first)

- [ ] Add tests for `EditorToolbar` with `variant="speaker"`:
  - Font family select is not rendered
  - Font size select is not rendered
  - H1 / H2 / H3 buttons are not rendered
  - Text colour picker is not rendered
  - Highlight colour picker is not rendered
  - Centre / right / justify alignment buttons are not rendered
  - Left-align button is rendered
  - Image button is not rendered
  - YouTube button is not rendered
- [ ] Add tests for `EditorToolbar` with `variant="full"`:
  - Image button is rendered
  - YouTube button is rendered
  - All alignment buttons are rendered

## GREEN (implementation)

- [ ] `EditorToolbar.tsx` — add `variant`, `onInsertImage`, `onInsertYouTube` props; gate sections accordingly; restore image + YouTube buttons under `variant === 'full'`
- [ ] `RichTextEditor.tsx` — add `toolbarVariant` prop; wire `onInsertImage` and `onInsertYouTube` callbacks (PromptDialog); pass `variant` + new callbacks to `EditorToolbar`
- [ ] `portal/SubmitPaperPage.tsx` — add `toolbarVariant="speaker"` to all `<RichTextEditor>` instances
- [ ] `portal/PaperEditForm.tsx` — add `toolbarVariant="speaker"` to all `<RichTextEditor>` instances

## REFACTOR

- [ ] Verify no other portal pages pass `<RichTextEditor>` without `toolbarVariant` (grep `portal/` for `<RichTextEditor`)
- [ ] Confirm admin pages compile and toolbar is unchanged

## Sweep

- [ ] `pnpm exec tsc --noEmit` — no new type errors
- [ ] `pnpm exec eslint src/` — clean
- [ ] `pnpm test` — all frontend tests green
