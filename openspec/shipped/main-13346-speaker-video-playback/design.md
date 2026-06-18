# Design — Speaker video playback

## Fix A — CSP `media-src`

The page CSP currently has no `media-src`, so `<video>` blob sources fall back to
`default-src 'self'` and are blocked. Add `media-src 'self' blob:` alongside the
existing `img-src … blob:` in each definition:

- `frontend/deploy/nginx.conf` — header used by the production frontend container.
- `deploy/staging/nginx.conf` — header used on staging (the env that reported the
  violation).
- `backend/app/main.py` — security-headers middleware, kept in sync for
  backend-served responses and the security test in `tests/auth/test_security.py`.

Example (backend middleware):

```python
"img-src 'self' data: blob:; "
"media-src 'self' blob:; "   # ← added
"font-src 'self'; "
```

Only an additive directive — no existing source list is relaxed. The nginx
`location ~* \.(mp4|...)` / API-proxy blocks are unchanged; the blob is produced
client-side from an authenticated `connect-src` fetch that already passes.

## Fix B — serve-time video MIME normalization

### Where the fix lives

A single helper in `backend/app/core/file_validation.py`:

```python
# MIME types stored at upload time that browsers cannot decode but which
# are byte-compatible with a playable container label.
_VIDEO_PLAYBACK_MIME_OVERRIDES = {
    "video/quicktime": "video/mp4",
}


def playback_content_type(content_type: str) -> str:
    """Map a stored attachment MIME to a browser-playable one for inline serving.

    macOS/iOS .MP4/.MOV files carry the ISO-BMFF major brand ``qt  `` and are
    stored as ``video/quicktime``, which Chromium refuses to decode even though
    the H.264/AAC streams play fine when labelled ``video/mp4``. Returns the
    input unchanged when no override applies.
    """
    return _VIDEO_PLAYBACK_MIME_OVERRIDES.get(content_type, content_type)
```

Both download endpoints use it for the `media_type`:

```python
return Response(
    content=attachment.file_data,
    media_type=playback_content_type(attachment.content_type),
    headers={...},
)
```

The stored `Attachment.content_type` is **not** modified — only the response label
changes. `list_attachments` / `AttachmentResponse` continue to report the original.

## Why not fix at upload time

- Serve-time normalization repairs the ~existing staging data (`video-2.MP4`) and any
  already-uploaded `video/quicktime` rows with zero migration.
- Keeps the audit trail of what was actually detected on upload.
- One mapping point, exercised by both endpoints.

## Why `video/quicktime → video/mp4` is safe

`.mov`/`.mp4` are the same ISO base-media container. Speaker-uploaded phone/laptop
recordings are H.264 video + AAC audio, which every modern browser decodes under the
`video/mp4` MIME. A genuinely exotic codec (e.g. ProRes) would still fail, but that is
not a supported upload format and is out of scope.

## Alternatives considered

- **Re-detect and rewrite `content_type` on existing rows (migration).** More moving
  parts, touches data, and still needs the upload path fixed. Rejected.
- **Switch frontend off the blob approach to a direct authenticated `<video src>`.**
  Larger change, reintroduces auth-header-on-media-tag problems the blob hooks exist
  to solve, and still serves the wrong `Content-Type`. Rejected.

## Test plan (RED → GREEN)

Backend (`backend/tests/`):

1. **RED** — `tests/auth/test_security.py`: assert the CSP header contains
   `media-src 'self' blob:`.
2. **RED** — unit test on `playback_content_type`: `video/quicktime` → `video/mp4`;
   `video/mp4`, `video/webm`, `image/jpeg` pass through unchanged.
3. **RED** — endpoint test: store an `applicant_video` attachment with
   `content_type="video/quicktime"`, GET the admin download endpoint, assert the
   response `Content-Type` is `video/mp4`. Repeat for the portal download endpoint.
4. **GREEN** — add `media-src` to all three CSP definitions; add helper + wire into
   both endpoints; tests pass.
5. Confirm a `video/mp4` attachment still serves as `video/mp4` (no regression).

nginx config files are not unit-tested; verify the two `nginx.conf` headers by
inspection and a manual staging check. No OpenAPI schema drift expected (response
shape unchanged). No frontend code changes required.
