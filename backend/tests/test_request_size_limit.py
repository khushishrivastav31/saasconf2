"""Unit tests for RequestSizeLimitMiddleware.

The middleware short-circuits oversized requests *before* the inner
CORSMiddleware runs, so its rejection must carry CORS headers itself —
otherwise the browser reports a large upload as an opaque CORS/Network error
instead of a clean 413. It must also be sized off MAX_UPLOAD_SIZE_MB so it
never rejects an upload the endpoints would accept.
"""

from starlette.requests import Request
from starlette.responses import PlainTextResponse

from app.config import get_settings
from app.main import RequestSizeLimitMiddleware

ALLOWED_ORIGIN = "http://localhost:3000"


def _request(content_length: int, origin: str | None = None) -> Request:
    headers = [(b"content-length", str(content_length).encode())]
    if origin:
        headers.append((b"origin", origin.encode()))
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/v1/attachments",
        "headers": headers,
    }
    return Request(scope)


async def _call_next(_request: Request) -> PlainTextResponse:
    return PlainTextResponse("ok")


def _middleware() -> RequestSizeLimitMiddleware:
    return RequestSizeLimitMiddleware(app=_call_next)


async def test_upload_at_max_size_passes_through() -> None:
    """A body at exactly the max upload size must reach the endpoint (has overhead headroom)."""
    settings = get_settings()
    size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    response = await _middleware().dispatch(_request(size, ALLOWED_ORIGIN), _call_next)
    assert response.status_code == 200


async def test_oversized_body_rejected_with_cors_header() -> None:
    """An over-limit request is rejected 413 *with* a CORS header for an allowed origin."""
    settings = get_settings()
    size = (settings.MAX_UPLOAD_SIZE_MB + 20) * 1024 * 1024
    response = await _middleware().dispatch(_request(size, ALLOWED_ORIGIN), _call_next)
    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN


async def test_oversized_body_no_cors_header_for_unknown_origin() -> None:
    """An over-limit request from a disallowed origin is still 413 but carries no CORS grant."""
    settings = get_settings()
    size = (settings.MAX_UPLOAD_SIZE_MB + 20) * 1024 * 1024
    response = await _middleware().dispatch(_request(size, "http://evil.example"), _call_next)
    assert response.status_code == 413
    assert "access-control-allow-origin" not in response.headers


async def test_50mb_video_upload_is_allowed() -> None:
    """The UI advertises 50MB videos; a 50MB body must not be rejected by the size guard."""
    fifty_mb = 50 * 1024 * 1024
    response = await _middleware().dispatch(_request(fifty_mb, ALLOWED_ORIGIN), _call_next)
    assert response.status_code == 200
