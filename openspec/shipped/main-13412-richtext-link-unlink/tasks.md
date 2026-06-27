# Tasks — MAIN-13412

## RED (tests first)

- [ ] `RichTextEditor.test.tsx` — Remove-link toolbar button:
  - Renders a "Remove Link" button
  - Is disabled when the cursor is not on a link (`isActive('link') === false`)
  - Is enabled when `isActive('link') === true`
  - Calls `chain().focus().extendMarkRange('link').unsetLink().run()` on click
- [ ] `RichTextEditor.test.tsx` — link dialog Remove action:
  - Opening the dialog while on a link shows a "Remove link" button
  - Opening the dialog with no link present does NOT show it
  - Clicking it triggers the unlink chain and closes the dialog
- [ ] `RichTextEditor.test.tsx` — empty-selection insert:
  - With an empty selection and not on a link, confirming a URL calls `insertContent` (linked text node), not `setLink`

## GREEN (implementation)

- [ ] `extensions.ts` — `Link.extend({ inclusive: false }).configure({ ... })`
- [ ] `RichTextEditor.tsx` — add `onRemove?` to `PromptDialogState` and render a "Remove link" button in `PromptDialog` when present
- [ ] `RichTextEditor.tsx` — rework `setLink`: wire `onRemove` when on a link; handle empty-selection insert via `insertContent` linked text node
- [ ] `RichTextEditor.tsx` — add `unsetLink` callback; pass `onUnsetLink` to `EditorToolbar`
- [ ] `EditorToolbar.tsx` — add `onUnsetLink` prop and a "Remove Link" `ToolbarButton` after the Link button, disabled unless `editor.isActive('link')`

## REFACTOR

- [ ] Confirm the Remove-link button appears in both `full` and `speaker` variants (link button is in both — no gating)
- [ ] Verify the dialog Remove button styling matches existing Cancel/OK layout and dark mode

## Sweep

- [ ] `pnpm exec tsc --noEmit` — no new type errors
- [ ] `pnpm exec eslint src/` — clean
- [ ] `pnpm test` — all frontend tests green
- [ ] Manual check in the running app: type after a link → plain text; Remove-link button clears a link; dialog Remove button clears a link

## Ship

- [ ] Branch off `release/v0.14.0` (same release line as MAIN-13413 / MAIN-13408)
- [ ] Move this folder `openspec/changes/main-13412-richtext-link-unlink/` → `openspec/shipped/` in the same PR
