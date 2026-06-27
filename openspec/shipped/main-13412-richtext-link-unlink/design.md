# Design — MAIN-13412

## Approach

Three coordinated changes in the shared editor — no callsite changes, no variant gating (applies to `'full'` and `'speaker'` toolbars alike, since the Link button exists in both):

1. `extensions.ts` — make the link mark non-inclusive.
2. `RichTextEditor.tsx` — fix the empty-selection link insert; add an unlink callback; extend `PromptDialog` with an optional Remove action.
3. `EditorToolbar.tsx` — add a Remove-link toolbar button next to the Link button.

## 1. Non-inclusive link mark (`extensions.ts`)

TipTap core reads `inclusive` as a mark extension field (`@tiptap/core` schema builder). Override it on the existing Link configuration:

```ts
Link.extend({ inclusive: false }).configure({
  openOnClick: false,
  HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
}),
```

Effect: with the cursor at the end boundary of a link, ProseMirror no longer extends the mark to newly typed characters — so typing right after a linked word produces plain text.

## 2. RichTextEditor.tsx

### `PromptDialog` — optional Remove action

Extend `PromptDialogState` with an optional remove handler:

```ts
interface PromptDialogState {
  open: boolean;
  title: string;
  defaultValue: string;
  onSubmit: (value: string) => void;
  onRemove?: () => void; // present only when editing an existing link
}
```

When `onRemove` is set, the dialog renders a left-aligned **Remove link** button (red/secondary styling) alongside Cancel/OK. Clicking it calls `onRemove()` then closes. (The dialog is already portaled to `document.body` from MAIN-13413, so no nesting concerns.)

### `setLink` callback — empty-selection + remove wiring

```ts
const setLink = useCallback(() => {
  if (!editor) return;
  const previousUrl = editor.getAttributes('link').href;
  const isOnLink = editor.isActive('link');
  const hasSelection = !editor.state.selection.empty;

  setPromptState({
    open: true,
    title: 'Enter URL',
    defaultValue: previousUrl || 'https://',
    onRemove: isOnLink
      ? () => editor.chain().focus().extendMarkRange('link').unsetLink().run()
      : undefined,
    onSubmit: (url: string) => {
      if (url === '') {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        return;
      }
      try {
        const parsed = new URL(url);
        if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) return;
      } catch {
        return;
      }
      if (!isOnLink && !hasSelection) {
        // No selection and not on a link: insert the URL as its own linked
        // text node so the mark can't bleed into subsequent typing.
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'text',
            text: url,
            marks: [{ type: 'link', attrs: { href: url } }],
          })
          .run();
        return;
      }
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    },
  });
}, [editor]);
```

### `unsetLink` callback for the toolbar button

```ts
const unsetLink = useCallback(() => {
  if (!editor) return;
  editor.chain().focus().extendMarkRange('link').unsetLink().run();
}, [editor]);
```

Pass `onUnsetLink={unsetLink}` to `EditorToolbar`.

## 3. EditorToolbar.tsx

Add a new prop and a button immediately after the existing Link button (present in both variants):

```ts
onUnsetLink: () => void;
```

```tsx
<ToolbarButton
  active={false}
  onClick={onUnsetLink}
  disabled={disabled || !editor.isActive('link')}
  title="Remove Link"
>
  {/* broken-link / unlink SVG icon */}
</ToolbarButton>
```

The button is disabled unless the cursor is inside a link (`editor.isActive('link')`). Toolbar already re-renders on selection change via `onSelectionUpdate`, so the enabled/disabled state stays accurate as the cursor moves.

## Affected files

| File | Change |
|---|---|
| `frontend/src/components/common/richtext/extensions.ts` | `Link.extend({ inclusive: false })` |
| `frontend/src/components/common/RichTextEditor.tsx` | empty-selection insert; `onRemove` in `PromptDialog`; `unsetLink` callback; pass `onUnsetLink` |
| `frontend/src/components/common/richtext/EditorToolbar.tsx` | `onUnsetLink` prop + Remove-link button |

No callsite changes — all `<RichTextEditor>` instances inherit the behavior.

## Testing notes

The test harness mocks `@tiptap/react` heavily, so the unit tests target the **controls and callbacks**, not ProseMirror's internal mark mechanics:

- Remove-link toolbar button renders, is disabled when not on a link, enabled when `isActive('link')` is true, and calls the unlink chain on click.
- The link dialog shows a Remove button when opened on an existing link and hides it otherwise; clicking it triggers `unsetLink`.
- Empty-selection submit path calls `insertContent` (linked text node) rather than `setLink`.

The non-inclusive mark change is schema configuration; it is covered by the existing extension wiring and verified manually in the running app (type after a link → plain text).

## No backend changes

`unsetLink` and the linked-text insert produce the same HTML shape already stored and rendered.
