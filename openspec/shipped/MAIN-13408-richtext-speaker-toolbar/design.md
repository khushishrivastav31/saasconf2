# Design — MAIN-13408

## Approach

Add a `toolbarVariant` prop to `RichTextEditor` (`'full' | 'speaker'`, default `'full'`).  
Thread it down to `EditorToolbar` as `variant`.  
All portal-facing `RichTextEditor` instances receive `toolbarVariant="speaker"`.  
All admin-facing instances keep the default (`'full'`).

No new abstraction or separate component needed — a single conditional per toolbar section is sufficient.

## RichTextEditor changes

**New prop:**
```ts
toolbarVariant?: 'full' | 'speaker';  // default: 'full'
```

**Image/YouTube restore (full variant only):**
- Re-add `onInsertImage` callback in `RichTextEditor`: opens a `PromptDialog` for an image URL, then calls `editor.chain().focus().setImage({ src: url }).run()`.
- Re-add `onInsertYouTube` callback: opens a `PromptDialog` for a YouTube URL, then calls `editor.commands.setYoutubeVideo({ src: url })`.
- Pass both callbacks to `EditorToolbar` alongside `variant`.
- Drag-and-paste image handling (`handleImageFile`) already works for all variants; no change needed there.

## EditorToolbar changes

**New props:**
```ts
variant: 'full' | 'speaker';
onInsertImage: () => void;   // only called when variant === 'full'
onInsertYouTube: () => void; // only called when variant === 'full'
```

**Hidden for `variant === 'speaker'`:**
| Section | Removed controls |
|---|---|
| Typography | Font family `<select>`, font size `<select>` |
| Headings | H1, H2, H3 buttons (+ their divider) |
| Colour | Text colour picker, highlight colour picker (+ their divider) |
| Alignment | Centre, right, justify buttons — left-align button stays |
| Media | Image button, YouTube button (entire media section hidden) |

**Restored for `variant === 'full'`:**
- Image button (URL prompt → `setImage`) with a camera/image SVG icon.
- YouTube button (URL prompt → `setYoutubeVideo`) with a play/video SVG icon.
- Both live in the existing "Links & Media" section, after the link button.

**Alignment section for `variant === 'speaker'`:**  
The section collapses to only the left-align button. No divider change needed — there will still be at least one button there.

## Portal callsites receiving `toolbarVariant="speaker"`

| File | Usage |
|---|---|
| `frontend/src/pages/portal/SubmitPaperPage.tsx` | all `<RichTextEditor>` instances |
| `frontend/src/pages/portal/PaperEditForm.tsx` | all `<RichTextEditor>` instances |

## Admin callsites (no change needed — default is `'full'`)

| File | Note |
|---|---|
| `frontend/src/pages/modules/cfp/CFPPapers/PaperForm/PaperBuiltinFields.tsx` | stays as-is |
| `frontend/src/pages/modules/cfp/CFPPapers/PaperForm/PaperCustomFields.tsx` | stays as-is |
| All other admin surfaces (`SponsorDetailPanel`, `LocationDetailPanel`, etc.) | unaffected |

## Extensions

No changes to `extensions.ts`. The `Youtube` and `ResizableImage` extensions remain registered for all editor instances. Toolbar gating is purely a UI concern — the extensions are harmless when the toolbar buttons that invoke them are hidden.

## No backend changes

The HTML produced by `setImage` and `setYoutubeVideo` is already stored and rendered correctly.
