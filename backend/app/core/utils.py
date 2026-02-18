"""Core utility functions."""

from datetime import UTC, datetime


def utcnow() -> datetime:
    """Timezone-aware UTC now. Use instead of datetime.utcnow()."""
    return datetime.now(UTC)
