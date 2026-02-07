"""Redis-based access token blacklist.

Fail-open design: if Redis is unavailable, tokens are NOT blacklisted
(availability > instant revocation for a 15-minute access token).
"""

import logging

from redis.asyncio import Redis

from app.config import get_settings

logger = logging.getLogger(__name__)

_redis: Redis | None = None


async def init_redis() -> None:
    """Initialize the Redis connection. Called during app startup."""
    global _redis
    settings = get_settings()
    try:
        _redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
        await _redis.ping()
        logger.info("Redis connected for token blacklist")
    except Exception:
        logger.warning("Redis unavailable — token blacklist disabled (fail-open)")
        _redis = None


async def close_redis() -> None:
    """Close the Redis connection. Called during app shutdown."""
    global _redis
    if _redis:
        await _redis.close()
        _redis = None


async def blacklist_token(jti: str, ttl_seconds: int) -> None:
    """Add a token's JTI to the blacklist with auto-expiry."""
    if not _redis:
        return
    try:
        await _redis.setex(f"token_blacklist:{jti}", max(ttl_seconds, 1), "1")
    except Exception:
        logger.warning("Failed to blacklist token %s", jti, exc_info=True)


async def is_token_blacklisted(jti: str) -> bool:
    """Check if a token is blacklisted. Returns False on Redis failure (fail-open)."""
    if not _redis:
        return False
    try:
        result = await _redis.get(f"token_blacklist:{jti}")
        return result is not None
    except Exception:
        logger.warning("Redis error checking blacklist for %s", jti, exc_info=True)
        return False
