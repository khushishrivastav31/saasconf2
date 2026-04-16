"""Shared rate limiter configured with Redis storage.

Using Redis as the backing store is essential when running multiple backend
workers or pods: slowapi's default in-memory storage is per-process, which
effectively disables rate limiting under horizontal scaling.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings

_settings = get_settings()

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_settings.REDIS_URL,
)
