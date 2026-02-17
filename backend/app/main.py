"""FastAPI application entry point."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.router import api_router
from app.config import get_settings
from app.core.logging import setup_logging
from app.core.exceptions import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    NotFoundError,
    SaaSConfException,
    SubmissionValidationError,
)

settings = get_settings()

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Sentry error monitoring
if settings.SENTRY_DSN:
    import sentry_sdk
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.SENTRY_ENVIRONMENT,
        release=f"saasconf-backend@{settings.APP_VERSION}",
        traces_sample_rate=0.1,
        send_default_pii=False,
    )


def _cors_response(request: Request, status_code: int, content: dict) -> JSONResponse:
    """Return a JSONResponse with CORS headers.

    FastAPI exception handlers bypass CORSMiddleware, so we must add
    the headers manually to avoid the browser blocking error responses.
    """
    response = JSONResponse(status_code=status_code, content=content)
    origin = request.headers.get("origin")
    if origin and origin in settings.CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response


def _check_production_safety() -> None:
    """Emit warnings for insecure settings in non-development environments."""
    import logging

    logger = logging.getLogger("saasconf.security")
    is_prod = settings.SENTRY_ENVIRONMENT not in ("development", "test")

    if is_prod and settings.DEBUG:
        logger.warning("SECURITY: DEBUG=True in '%s' environment — disable for production", settings.SENTRY_ENVIRONMENT)
    if is_prod and settings.SUPER_ADMIN_EMAIL == "admin@saasconf.com":
        logger.warning("SECURITY: SUPER_ADMIN_EMAIL is still the default — change for production")
    if is_prod and any("localhost" in o or "127.0.0.1" in o for o in settings.CORS_ORIGINS):
        logger.warning("SECURITY: CORS_ORIGINS contains localhost entries — remove for production")
    if is_prod and not settings.RESEND_API_KEY:
        logger.warning("SECURITY: RESEND_API_KEY not set — emails will only be logged, not sent")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    import logging

    from app.core.token_blacklist import close_redis, init_redis

    # Startup
    setup_logging(debug=settings.DEBUG, level=settings.LOG_LEVEL)
    logger = logging.getLogger("saasconf")
    logger.info("Starting %s v%s", settings.APP_NAME, settings.APP_VERSION)
    _check_production_safety()
    await init_redis()
    yield
    # Shutdown
    await close_redis()
    logger.info("Shutting down")


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Multi-tenant SaaS platform for conference management",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# Add rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self'; "
            "connect-src 'self'; "
            "worker-src 'self' blob:; "
            "frame-ancestors 'none'"
        )
        if not settings.DEBUG:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app.add_middleware(SecurityHeadersMiddleware)


# Exception handlers
@app.exception_handler(AuthenticationError)
async def authentication_error_handler(
    request: Request, exc: AuthenticationError
) -> JSONResponse:
    """Handle authentication errors."""
    return _cors_response(
        request, 401, {"detail": exc.message, "type": "authentication_error"}
    )


@app.exception_handler(AuthorizationError)
async def authorization_error_handler(
    request: Request, exc: AuthorizationError
) -> JSONResponse:
    """Handle authorization errors."""
    return _cors_response(
        request, 403, {"detail": exc.message, "type": "authorization_error"}
    )


@app.exception_handler(NotFoundError)
async def not_found_error_handler(
    request: Request, exc: NotFoundError
) -> JSONResponse:
    """Handle not found errors."""
    return _cors_response(
        request, 404, {"detail": exc.message, "type": "not_found_error"}
    )


@app.exception_handler(ConflictError)
async def conflict_error_handler(
    request: Request, exc: ConflictError
) -> JSONResponse:
    """Handle resource conflict errors."""
    return _cors_response(
        request, 409, {"detail": exc.message, "type": "conflict_error"}
    )


@app.exception_handler(SubmissionValidationError)
async def submission_validation_error_handler(
    request: Request, exc: SubmissionValidationError
) -> JSONResponse:
    """Handle paper submission validation errors with structured details."""
    return _cors_response(
        request,
        422,
        {
            "detail": {
                "message": exc.message,
                "missing_fields": exc.missing_fields,
            },
        },
    )


@app.exception_handler(SaaSConfException)
async def saasconf_error_handler(
    request: Request, exc: SaaSConfException
) -> JSONResponse:
    """Handle general application errors."""
    return _cors_response(
        request, 400, {"detail": exc.message, "type": "error"}
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """Catch-all for unhandled exceptions, ensuring CORS headers are present."""
    import logging
    import traceback

    logger = logging.getLogger("saasconf")
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc)
    # Sentry captures this automatically via its FastAPI integration,
    # but our catch-all handler prevents propagation, so capture explicitly
    if settings.SENTRY_DSN:
        import sentry_sdk
        sentry_sdk.capture_exception(exc)
    if settings.DEBUG:
        traceback.print_exc()
        # Return actual error details in debug mode to help diagnose issues
        return _cors_response(
            request, 500, {
                "detail": f"{type(exc).__name__}: {str(exc)}",
                "type": "server_error",
            }
        )
    return _cors_response(
        request, 500, {"detail": "Internal server error", "type": "server_error"}
    )


# Health check endpoint
@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


# Include API router
app.include_router(api_router, prefix="/api/v1")
