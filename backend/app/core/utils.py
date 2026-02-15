"""Core utility functions."""

from datetime import datetime, timezone


def utcnow() -> datetime:
    """Timezone-aware UTC now. Use instead of datetime.utcnow()."""
    return datetime.now(timezone.utc)
