"""Structured logging configuration.

Outputs JSON lines in production for log aggregation tools.
Outputs human-readable colored logs in development.
"""

import logging
import sys

from pythonjsonlogger.json import JsonFormatter


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
        formatter = logging.Formatter(
            fmt="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
            datefmt="%H:%M:%S",
        )
    else:
        # JSON format for production log aggregation
        formatter = JsonFormatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
        )

    handler.setFormatter(formatter)
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
        "correlation_id": correlation_id,
    }
    if details:
        extra.update(details)
    logger.warning("SECURITY_EVENT: %s", event_type, extra={"security": extra})
