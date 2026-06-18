# MAIN-13346 — Speaker video doesn't play in portal or admin

## Problem

A speaker uploads a profile video (e.g. `video-2.MP4`). The upload succeeds and a
thumbnail preview appears, but when the video is opened — both in the **speaker
portal** (`MediaPreviewModal`) and in the **admin** CFP applicant view — the player
renders black, stuck at `0:00`, and will not play.

There are two independent causes. **(A)** is the confirmed staging blocker; **(B)** is
a secondary issue affecting certain file brands.

### Root cause A — CSP blocks `blob:` media (confirmed on staging)

On staging/production the browser reports:

```
Loading media from 'blob:https://staging.sonrisa.ventures/…' violates the following
Content Security Policy directive: "default-src 'self'". Note that 'media-src' was
not explicitly set, so 'default-src' is used as a fallback. The action has been
blocked.
```

Both media hooks (`useAuthMedia`, `usePortalAuthMedia`) download the attachment as a
blob and play it from an `URL.createObjectURL(...)` (`blob:`) source. The page CSP —
served by nginx (`frontend/deploy/nginx.conf`, `deploy/staging/nginx.conf`) and
mirrored in `backend/app/main.py` — lists `blob:` under `img-src` (so **pictures**
load) but defines **no `media-src`**. Per CSP, `<video>`/`<audio>` fall back to
`default-src 'self'`, which excludes `blob:`, so the video source is blocked outright.

This is why it "works locally": the Vite dev server sends no such CSP header.

### Root cause B — `video/quicktime` MIME isn't browser-playable

Videos are served with the MIME type detected at upload time and stored on the
`Attachment.content_type` column. Detection uses the `filetype` library
(`validate_upload` in `backend/app/core/file_validation.py`).

`.MP4`/`.MOV` files recorded on macOS/iOS are ISO base-media-format containers whose
**major brand is `qt  `**. `filetype` classifies any `qt  ` brand as
`video/quicktime`, regardless of the `.MP4` extension or the (browser-playable)
H.264/AAC streams inside. Verified locally:

```
qt   -> video/quicktime
isom -> video/mp4
mp42 -> video/mp4
```

Both the admin (`useAuthMedia`) and portal (`usePortalAuthMedia`) hooks download the
attachment with `responseType: 'blob'`, so the resulting `Blob.type` — and therefore
the `<video>` source MIME — is whatever the download endpoint sends as
`Content-Type`. When that is `video/quicktime`, Chromium-based browsers refuse to
decode it and show an inert player. The same bytes play correctly when labelled
`video/mp4`.

This affects every video already stored as `video/quicktime` (including the staging
`video-2.MP4`), not just future uploads. Note that once CSP is fixed (A), a
`qt`-brand file would still fail to decode until (B) is also applied — so both fixes
ship together.

### Out of scope / already correct

The ticket's first complaint — "the video shouldn't be mandatory for speakers" — is
already working: `required_speaker_fields` drives the `*` marker and the
`handleSubmit` guard in `ProfilePage.tsx`, and video is only required when a CFP
explicitly lists it. No change needed there. This proposal covers **only** the
playback bug.

## Proposed solution

### Fix A — allow `blob:` media in CSP

Add `media-src 'self' blob:` to the page CSP in all three places it is defined:

- `frontend/deploy/nginx.conf`
- `deploy/staging/nginx.conf`
- `backend/app/main.py` (security-headers middleware)

This mirrors the existing `img-src 'self' … blob:` allowance and unblocks
`<video>`/`<audio>` blob playback. `connect-src` already permits the API origin, so
the underlying blob download is unaffected.

### Fix B — serve `video/quicktime` as `video/mp4`

Normalize the response `Content-Type` for video attachments at **serve time** so the
browser receives a playable MIME. Map `video/quicktime` to `video/mp4` (the
underlying ISO-BMFF/H.264 container plays identically under that label). Apply the
mapping in both download endpoints:

- `backend/app/api/v1/attachments.py` → `download_attachment` (admin)
- `backend/app/api/v1/cfp_portal/attachments.py` → `download_portal_attachment` (portal)

Serve-time normalization is chosen over re-detecting/rewriting stored rows because it
repairs **already-uploaded** attachments with no data migration, while keeping the
original `content_type` intact in the database for auditing.

## Impact

- Existing and future speaker/paper videos play in portal and admin on staging/prod.
- CSP change is additive (one new directive); no other directive relaxed.
- No schema or migration changes.
- No frontend code changes required (hooks already consume the served blob).
