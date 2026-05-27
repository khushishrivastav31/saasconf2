# Design — Email template editor padding

## File to change

`frontend/src/pages/.../EmailTemplateEditor.tsx` (locate during recon).

## Change

Wrap the RichTextEditor (and the preview pane) with a container that
applies horizontal padding:

```tsx
<div className="px-6">
  <RichTextEditor ... />
</div>
```

or extend the existing wrapper's className.

## Test approach

Visual cosmetic changes are best validated by:
1. A small DOM-class assertion test:
   ```ts
   expect(editorContainer.className).toMatch(/px-6|px-4/);
   ```
2. Manual verification in the running app.

Avoid snapshot tests for cosmetic CSS — they are noisy and brittle.

## Test Impact

| File | Change |
|------|--------|
| EmailTemplateEditor test (new or extend) | Asserts horizontal padding class on the editor container |
