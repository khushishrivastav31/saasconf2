# Tasks — MAIN-13346 speaker video playback

## Fix A — CSP `media-src`

- [ ] RED: extend `tests/auth/test_security.py` to assert the CSP header contains
      `media-src 'self' blob:`. Confirm it fails.
- [ ] GREEN: add `media-src 'self' blob:` to the CSP in `backend/app/main.py`,
      `frontend/deploy/nginx.conf`, and `deploy/staging/nginx.conf`.

## Fix B — video MIME normalization

- [ ] RED: add `tests/test_file_validation.py` (or extend existing) covering
      `playback_content_type` — `video/quicktime` → `video/mp4`; `video/mp4`,
      `video/webm`, `image/jpeg`, `application/pdf` unchanged. Confirm it fails.
- [ ] RED: extend attachment download tests — assert admin
      (`/api/v1/attachments/{id}/download`) and portal
      (`/portal/attachments/{id}/download`) return `Content-Type: video/mp4` for a
      stored `video/quicktime` `applicant_video`. Confirm they fail.
- [ ] GREEN: add `playback_content_type` + `_VIDEO_PLAYBACK_MIME_OVERRIDES` to
      `app/core/file_validation.py`.
- [ ] GREEN: use `playback_content_type(attachment.content_type)` as `media_type` in
      `download_attachment` (`app/api/v1/attachments.py`) and
      `download_portal_attachment` (`app/api/v1/cfp_portal/attachments.py`).
- [ ] REFACTOR: confirm no duplication; original `content_type` still stored & listed.

## Verify

- [ ] `venv/bin/python -m pytest tests/auth/test_security.py tests/test_file_validation.py tests/test_attachments*.py -v`
- [ ] `venv/bin/python -m mypy app/ --config-file=pyproject.toml`
- [ ] `ruff check app/ && ruff format --check app/`
- [ ] Full sweep: `venv/bin/python -m pytest tests/ -n 4 -q`
- [ ] Manual: re-open the existing staging `video-2.MP4` in portal + admin — plays.

## Ship

- [ ] Move `openspec/changes/main-13346-speaker-video-playback/` →
      `openspec/shipped/` in the same PR.
