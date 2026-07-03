# MAIN-13441: Design

## Why not just add `download` to the existing blob `<a>`

The current thumbnail already sits behind an `URL.createObjectURL` blob
fetched via `useAuthMedia`/`usePortalAuthMedia` — auth-gated fetch, not a
plain URL a browser can navigate to directly. A plain `<a href={blobUrl}
target="_blank">` would open the blob in a new tab fine (blob URLs are
valid same-session), but:
- The blob URL is revoked/regenerated on component unmount/remount in some
  auth-media hook implementations — a link opened in a background tab could
  break if the source component unmounts before the tab is used.
- `download` attribute on a blob anchor works but won't carry a real
  filename unless explicitly set — needs `download={attachment.filename}`.

Simplest reliable approach: point the hyperlink/download at the **actual
download endpoint** (`download_portal_attachment`/`download_attachment`),
which already handles auth via the normal request flow, rather than
depending on a client-held blob URL's lifetime.

## Component shape

```tsx
function VideoAttachmentLink({ attachment, onPreview }: Props) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={onPreview}>{/* existing thumbnail/preview trigger */}</button>
      <a href={downloadUrl(attachment.id)} target="_blank" rel="noopener noreferrer">
        Open video
      </a>
      <a href={downloadUrl(attachment.id)} download={attachment.filename}>
        Download
      </a>
    </div>
  );
}
```

Where `downloadUrl` builds the existing `download_attachment`/
`download_portal_attachment` route depending on admin vs. portal context
(the two existing hooks already know which context they're in — pass that
through rather than duplicating URL-building logic).

## Extraction target

Replace the duplicated block in `AssignedPapersTab.tsx:199-248`,
`EvaluatedPapersTab.tsx:147-192`, and `PaperDetailModal.tsx:176-221` with
this shared component. Since the admin (`PaperDetailModal`) and portal
(`AssignedPapersTab`/`EvaluatedPapersTab`) contexts use different auth-media
hooks (`useAuthMedia` vs `usePortalAuthMedia`), the shared component takes
the resolved attachment + a context flag (or the download URL pre-built by
the caller) rather than calling a hook itself — keeps it context-agnostic.

## Auth on download links

Confirm `download_attachment`/`download_portal_attachment` accept the
existing session/cookie auth for a plain browser navigation (not just an
`Authorization` header via `fetch`) — if they require a bearer token header
that a plain `<a>` tag can't send, the download link needs to go through
the same authenticated-fetch + blob approach as today, just with a proper
`download` attribute and filename set on the resulting blob anchor instead
of a direct endpoint link. Check this during implementation before
committing to the "direct link" design above.
