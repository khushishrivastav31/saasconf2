"""FastAPI application entry point."""

import secrets
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.router import api_router
from app.config import get_settings
from app.core.exceptions import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    InvoiceSendConfigurationError,
    NotFoundError,
    SaaSConfException,
    SubmissionValidationError,
)
from app.core.logging import setup_logging
from app.core.rate_limiter import limiter

settings = get_settings()

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
    if is_prod and not settings.DATABASE_SSL_REQUIRED:
        logger.warning(
            "SECURITY: DATABASE_SSL_REQUIRED=False in '%s' environment — DB traffic is not encrypted in transit",
            settings.SENTRY_ENVIRONMENT,
        )
    if is_prod and not settings.OPS_API_KEY:
        logger.warning("SECURITY: OPS_API_KEY is empty — /metrics and /ops/* endpoints are effectively locked closed")


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
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# Prometheus metrics — instrumentation only. The /metrics endpoint is
# registered below with OPS_API_KEY bearer auth (defense-in-depth).
Instrumentator().instrument(app)

# ---------------------------------------------------------------------------
# Middleware classes
# ---------------------------------------------------------------------------


class OriginValidationMiddleware(BaseHTTPMiddleware):
    """Reject state-changing requests with mismatched Origin header (CSRF defense-in-depth)."""

    async def dispatch(self, request: Request, call_next):
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            origin = request.headers.get("origin")
            if origin and origin not in settings.CORS_ORIGINS:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Origin not allowed"},
                )
        return await call_next(request)


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests with bodies exceeding the configured maximum size."""

    MAX_BODY_SIZE = 10 * 1024 * 1024  # 10MB

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.MAX_BODY_SIZE:
            return JSONResponse(
                status_code=413,
                content={"detail": "Request body too large"},
            )
        return await call_next(request)


class CorrelationIDMiddleware(BaseHTTPMiddleware):
    """Attach a unique correlation ID to every request/response for tracing.

    Honours either ``X-Request-ID`` (preferred, common upstream convention) or
    ``X-Correlation-ID`` (legacy in-house name). Generates a fresh uuid4 if
    neither is present. The id is stored on ``request.state`` for ad-hoc use,
    published into the ``request_id_ctx`` ContextVar so every log line emitted
    during the request carries it, and tagged onto the Sentry scope so errors
    group with the originating request.
    """

    async def dispatch(self, request: Request, call_next):
        from app.core.logging import request_id_ctx

        correlation_id = (
            request.headers.get("X-Request-ID") or request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        )
        request.state.correlation_id = correlation_id
        token = request_id_ctx.set(correlation_id)

        if settings.SENTRY_DSN:
            import sentry_sdk

            sentry_sdk.set_tag("request_id", correlation_id)

        try:
            response = await call_next(request)
        finally:
            request_id_ctx.reset(token)
        response.headers["X-Request-ID"] = correlation_id
        response.headers["X-Correlation-ID"] = correlation_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        # CSP: 'unsafe-inline' for style-src is required by Tailwind CSS / React
        # inline styles. Mitigated by DOMPurify + nh3 HTML sanitization (defense-in-depth).
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
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        return response


# ---------------------------------------------------------------------------
# Middleware registration
# Order matters: middleware is applied in REVERSE order of registration.
# Register innermost first, outermost last.
# ---------------------------------------------------------------------------

# CORS middleware (innermost - must be first registered)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With", "sentry-trace", "baggage"],
)

# Origin validation (CSRF defense)
app.add_middleware(OriginValidationMiddleware)

# Request size limits
app.add_middleware(RequestSizeLimitMiddleware)

# Correlation ID for request tracing
app.add_middleware(CorrelationIDMiddleware)

# Security headers (outermost - must be last registered)
app.add_middleware(SecurityHeadersMiddleware)


# Exception handlers
@app.exception_handler(AuthenticationError)
async def authentication_error_handler(request: Request, exc: AuthenticationError) -> JSONResponse:
    """Handle authentication errors."""
    return _cors_response(request, 401, {"detail": exc.message, "type": "authentication_error"})


@app.exception_handler(AuthorizationError)
async def authorization_error_handler(request: Request, exc: AuthorizationError) -> JSONResponse:
    """Handle authorization errors."""
    return _cors_response(request, 403, {"detail": exc.message, "type": "authorization_error"})


@app.exception_handler(NotFoundError)
async def not_found_error_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    """Handle not found errors."""
    return _cors_response(request, 404, {"detail": exc.message, "type": "not_found_error"})


@app.exception_handler(ConflictError)
async def conflict_error_handler(request: Request, exc: ConflictError) -> JSONResponse:
    """Handle resource conflict errors."""
    return _cors_response(request, 409, {"detail": exc.message, "type": "conflict_error"})


@app.exception_handler(SubmissionValidationError)
async def submission_validation_error_handler(request: Request, exc: SubmissionValidationError) -> JSONResponse:
    """Handle paper submission validation errors with structured details."""
    detail: dict = {"message": exc.message}
    if exc.missing_fields:
        detail["missing_fields"] = exc.missing_fields
    if exc.char_errors:
        detail["char_errors"] = exc.char_errors
    return _cors_response(request, 422, {"detail": detail})


@app.exception_handler(InvoiceSendConfigurationError)
async def invoice_send_config_error_handler(request: Request, exc: InvoiceSendConfigurationError) -> JSONResponse:
    """Missing tenant-level invoice config (e.g. accounting_email) → 422."""
    return _cors_response(request, 422, {"detail": exc.message, "type": "invoice_send_configuration_error"})


@app.exception_handler(SaaSConfException)
async def saasconf_error_handler(request: Request, exc: SaaSConfException) -> JSONResponse:
    """Handle general application errors."""
    return _cors_response(request, 400, {"detail": exc.message, "type": "error"})


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
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
            request,
            500,
            {
                "detail": f"{type(exc).__name__}: {exc!s}",
                "type": "server_error",
            },
        )
    return _cors_response(request, 500, {"detail": "Internal server error", "type": "server_error"})


# Health check endpoints
@app.get("/health")
async def health_check() -> dict:
    """Liveness probe — confirms the process is running."""
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


@app.get("/health/ready")
async def readiness_check() -> JSONResponse:
    """Readiness probe — checks DB and Redis connectivity."""
    import logging

    from sqlalchemy import text

    from app.core.security.token_blacklist import _redis
    from app.db.session import engine

    logger = logging.getLogger("saasconf.health")
    checks: dict[str, str] = {}

    # Check database
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        logger.error("Readiness check: database unavailable — %s", e)
        checks["database"] = "unavailable"

    # Check Redis
    try:
        if _redis:
            await _redis.ping()  # type: ignore[misc]
            checks["redis"] = "ok"
        else:
            checks["redis"] = "not_configured"
    except Exception as e:
        logger.error("Readiness check: Redis unavailable — %s", e)
        checks["redis"] = "unavailable"

    all_ok = all(v in ("ok", "not_configured") for v in checks.values())
    return JSONResponse(
        status_code=200 if all_ok else 503,
        content={
            "status": "ready" if all_ok else "not_ready",
            "checks": checks,
        },
    )


# ─── Ops endpoints (cron / ops API key) ──────────────────


def _verify_ops_auth(request: Request) -> bool:
    """Verify ops endpoint authorization using OPS_API_KEY."""
    if not settings.OPS_API_KEY:
        return False
    auth_header = request.headers.get("Authorization", "")
    expected = f"Bearer {settings.OPS_API_KEY}"
    return secrets.compare_digest(auth_header, expected)


@app.get("/metrics", include_in_schema=False)
async def metrics(request: Request) -> Response:
    # Nginx blocks /metrics at the public edge; this bearer check is defense-in-depth
    # so a compromised sidecar or leaked internal hostname can't trivially scrape metrics.
    if not _verify_ops_auth(request):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/ops/data-retention-cleanup")
@limiter.limit("5/hour")
async def data_retention_cleanup(
    request: Request,
    authorization: str | None = None,
) -> JSONResponse:
    """Run data retention cleanup (expired tokens, old audit logs).

    Secured via a shared secret in the Authorization header,
    so it can be called from cron jobs without a full JWT session.
    """
    import logging

    from sqlalchemy import text

    from app.db.session import async_session_maker

    logger = logging.getLogger("saasconf.ops")

    if not _verify_ops_auth(request):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    try:
        async with async_session_maker() as session:
            result = await session.execute(text("SELECT * FROM run_data_retention_cleanup()"))
            rows = [{"task": row[0], "deleted_rows": row[1]} for row in result.fetchall()]
            await session.commit()
            logger.info("Data retention cleanup completed: %s", rows)
            return JSONResponse(content={"status": "completed", "results": rows})
    except Exception as e:
        logger.error("Data retention cleanup failed: %s", e, exc_info=True)
        return JSONResponse(status_code=500, content={"detail": "Data retention cleanup failed"})


@app.post("/ops/send-deadline-reminders")
@limiter.limit("5/hour")
async def send_deadline_reminders(
    request: Request,
) -> JSONResponse:
    """Send email reminders for approaching deadlines.

    Called hourly by the deadline-cron container.
    Checks active deadlines and sends reminders at 7 days, 1 day, and on the due date.
    """
    import logging
    from datetime import UTC, datetime, timedelta
    from zoneinfo import ZoneInfo

    from sqlalchemy import and_, or_, select

    from app.core.email import send_deadline_reminder
    from app.db.session import async_session_maker
    from app.models.conference import Conference
    from app.models.deadline import Deadline

    logger = logging.getLogger("saasconf.ops")

    if not _verify_ops_auth(request):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    now = datetime.now(UTC)
    sent_count = 0
    errors = 0

    try:
        async with async_session_maker() as session:
            # Query active deadlines that have unsent reminders due
            result = await session.execute(
                select(Deadline, Conference)
                .join(Conference, Deadline.conference_id == Conference.id)
                .where(
                    Deadline.is_active.is_(True),
                    or_(
                        and_(Deadline.due_date - timedelta(days=7) <= now, Deadline.reminder_7d_sent.is_(False)),
                        and_(Deadline.due_date - timedelta(days=1) <= now, Deadline.reminder_1d_sent.is_(False)),
                        and_(Deadline.due_date <= now, Deadline.reminder_due_sent.is_(False)),
                    ),
                )
            )
            rows = result.all()

            for deadline, conference in rows:
                # Determine recipient email
                to_email = conference.contact_email or conference.support_email
                if not to_email:
                    continue

                # Check email sending is enabled
                conf_settings = conference.settings or {}
                if not conf_settings.get("email_sending_enabled", True):
                    continue

                # Format due date in conference timezone
                tz = ZoneInfo(conference.timezone) if conference.timezone else UTC
                due_local = deadline.due_date.astimezone(tz)
                due_formatted = due_local.strftime("%B %d, %Y at %H:%M %Z")

                # Send applicable reminders
                reminders_to_send: list[tuple[str, str]] = []
                if deadline.due_date <= now and not deadline.reminder_due_sent:
                    reminders_to_send.append(("today", "reminder_due_sent"))
                if deadline.due_date - timedelta(days=1) <= now and not deadline.reminder_1d_sent:
                    reminders_to_send.append(("1 day", "reminder_1d_sent"))
                if deadline.due_date - timedelta(days=7) <= now and not deadline.reminder_7d_sent:
                    reminders_to_send.append(("7 days", "reminder_7d_sent"))

                for reminder_type, flag_attr in reminders_to_send:
                    try:
                        sent = await send_deadline_reminder(
                            session,
                            to=to_email,
                            conference_name=conference.name or "Conference",
                            conference_id=conference.id,
                            tenant_id=conference.tenant_id,
                            deadline_title=deadline.title,
                            description=deadline.description,
                            due_date_formatted=due_formatted,
                            reminder_type=reminder_type,
                        )
                        if sent:
                            setattr(deadline, flag_attr, True)
                            sent_count += 1
                    except Exception as e:
                        logger.error("Failed to send %s reminder for deadline %s: %s", reminder_type, deadline.id, e)
                        errors += 1

            await session.commit()
            logger.info("Deadline reminders sent: %d, errors: %d", sent_count, errors)
            return JSONResponse(content={"status": "completed", "sent": sent_count, "errors": errors})
    except Exception as e:
        logger.error("Deadline reminder job failed: %s", e, exc_info=True)
        return JSONResponse(status_code=500, content={"detail": "Failed to send deadline reminders"})


@app.post("/ops/send-payment-reminders")
@limiter.limit("5/hour")
async def send_payment_reminders(
    request: Request,
) -> JSONResponse:
    """Send payment reminders for overdue invoices across all conferences.

    Called daily by the payment-reminder-cron container.
    Checks active conferences and sends 1st/2nd payment reminders as configured.
    """
    import logging

    from sqlalchemy import select

    from app.core.payment_reminder_service import generate_and_send_reminders
    from app.db.session import async_session_maker
    from app.models.conference import Conference

    logger = logging.getLogger("saasconf.ops")

    if not _verify_ops_auth(request):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    total_sent = 0
    total_errors = 0
    conferences_checked = 0

    try:
        async with async_session_maker() as session:
            # Get all active conferences
            result = await session.execute(select(Conference).where(Conference.is_active.is_(True)))
            conferences = list(result.scalars().all())

            for conference in conferences:
                try:
                    counts = await generate_and_send_reminders(session, conference)
                    total_sent += counts["sent"]
                    total_errors += counts["errors"]
                    conferences_checked += 1
                except Exception as e:
                    logger.error(
                        "Payment reminder failed for conference %s: %s",
                        conference.id,
                        e,
                    )
                    total_errors += 1

        logger.info(
            "Payment reminders: sent=%d, errors=%d, conferences=%d",
            total_sent,
            total_errors,
            conferences_checked,
        )
        return JSONResponse(
            content={
                "status": "completed",
                "sent": total_sent,
                "errors": total_errors,
                "conferences_checked": conferences_checked,
            }
        )
    except Exception as e:
        logger.error("Payment reminder job failed: %s", e, exc_info=True)
        return JSONResponse(status_code=500, content={"detail": "Failed to send payment reminders"})


# Include API router
app.include_router(api_router, prefix="/api/v1")
