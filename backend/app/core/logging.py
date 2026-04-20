"""Structured logging configuration.

Outputs JSON lines in production for log aggregation tools.
Outputs human-readable colored logs in development.
"""

import logging
import re
import sys
from contextvars import ContextVar

from pythonjsonlogger.json import JsonFormatter

# Per-request correlation ID. Populated by CorrelationIDMiddleware from the
# incoming X-Request-ID / X-Correlation-ID header (or a fresh uuid4) so any
# log line or security event emitted while handling that request carries the
# same id — and downstream calls to `log_security_event` pick it up
# automatically via `get_request_id()`.
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)


def get_request_id() -> str | None:
    """Return the current request's correlation ID, or None outside a request."""
    return request_id_ctx.get()


class RequestIDFilter(logging.Filter):
    """Attach the current request_id (if any) to every LogRecord."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()
        return True


# Patterns that indicate sensitive data in log messages
_SENSITIVE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r'("?password"?\s*[:=]\s*)"[^"]*"', re.IGNORECASE), r"\1" + '"***"'),
    (re.compile(r'("?secret"?\s*[:=]\s*)"[^"]*"', re.IGNORECASE), r"\1" + '"***"'),
    (re.compile(r'("?token"?\s*[:=]\s*)"[^"]*"', re.IGNORECASE), r"\1" + '"***"'),
    (re.compile(r'("?api_key"?\s*[:=]\s*)"[^"]*"', re.IGNORECASE), r"\1" + '"***"'),
    (re.compile(r'("?authorization"?\s*[:=]\s*)"[^"]*"', re.IGNORECASE), r"\1" + '"***"'),
    (re.compile(r"(Bearer\s+)\S+", re.IGNORECASE), r"\1***"),
    (re.compile(r"(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+"), r"\1.***"),
]


class SensitiveFieldFilter(logging.Filter):
    """Redact sensitive fields (passwords, tokens, secrets) from log messages."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            for pattern, replacement in _SENSITIVE_PATTERNS:
                record.msg = pattern.sub(replacement, record.msg)
        if record.args and isinstance(record.args, tuple):
            redacted = []
            for arg in record.args:
                if isinstance(arg, str):
                    for pattern, replacement in _SENSITIVE_PATTERNS:
                        arg = pattern.sub(replacement, arg)
                redacted.append(arg)
            record.args = tuple(redacted)
        return True


def setup_logging(*, debug: bool = False, level: str = "INFO") -> None:
    """Configure application logging.

    Args:
        debug: When True, use human-readable format. When False, use JSON.
        level: Log level name (e.g. "DEBUG", "INFO", "WARNING"). Ignored
            when *debug* is True (always DEBUG in that case).
    """
    root = logging.getLogger()
    log_level = logging.DEBUG if debug else getattr(logging, level.upper(), logging.INFO)
    root.setLevel(log_level)

    # Remove existing handlers to avoid duplicates on reload
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)

    if debug:
        # Human-readable format for development
        formatter: logging.Formatter = logging.Formatter(
            fmt="%(asctime)s %(levelname)-8s %(name)s [req=%(request_id)s]  %(message)s",
            datefmt="%H:%M:%S",
            defaults={"request_id": "-"},
        )
    else:
        # JSON format for production log aggregation
        formatter = JsonFormatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(request_id)s %(message)s",
            rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
        )

    handler.setFormatter(formatter)
    handler.addFilter(RequestIDFilter())
    handler.addFilter(SensitiveFieldFilter())
    root.addHandler(handler)

    # Quiet noisy loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


def get_security_logger() -> logging.Logger:
    """Get a dedicated logger for security events."""
    return logging.getLogger("saasconf.security")


def log_security_event(
    event_type: str,
    *,
    user_id: str | None = None,
    tenant_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    details: dict | None = None,
    correlation_id: str | None = None,
) -> None:
    """Log a structured security event."""
    logger = get_security_logger()
    extra = {
        "event_type": event_type,
        "user_id": str(user_id) if user_id else None,
        "tenant_id": str(tenant_id) if tenant_id else None,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "correlation_id": correlation_id or request_id_ctx.get(),
    }
    if details:
        extra.update(details)
    logger.warning("SECURITY_EVENT: %s", event_type, extra={"security": extra})
