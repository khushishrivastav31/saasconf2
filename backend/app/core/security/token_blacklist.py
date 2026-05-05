"""Redis-based access token blacklist and account lockout.

Fail-open design: if Redis is unavailable, tokens are NOT blacklisted
(availability > instant revocation for a 15-minute access token).

Account lockout: tracks failed login attempts per email. After
MAX_LOGIN_ATTEMPTS failures within the TTL window, the account is
locked for LOCKOUT_DURATION_SECONDS.
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
        await _redis.ping()  # type: ignore[misc]
        logger.info("Redis connected for token blacklist")
    except Exception:
        logger.warning("Redis unavailable — token blacklist disabled (fail-open)")
        _redis = None


async def close_redis() -> None:
    """Close the Redis connection. Called during app shutdown."""
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


async def blacklist_token(jti: str, ttl_seconds: int) -> None:
    """Add a token's JTI to the blacklist with auto-expiry."""
    if not _redis:
        logger.warning("SECURITY: Redis unavailable — token %s NOT blacklisted (logout incomplete)", jti)
        return
    try:
        await _redis.setex(f"token_blacklist:{jti}", max(ttl_seconds, 1), "1")
    except Exception:
        logger.warning("SECURITY: Failed to blacklist token %s — logout may be incomplete", jti, exc_info=True)


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


# ---------------------------------------------------------------------------
# Account lockout (brute-force protection)
# ---------------------------------------------------------------------------

MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 15 * 60  # 15 minutes


async def record_failed_login(email: str) -> None:
    """Increment the failed-login counter for *email*. Auto-expires after lockout window."""
    if not _redis:
        return
    key = f"login_attempts:{email.lower()}"
    try:
        pipe = _redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, LOCKOUT_DURATION_SECONDS)
        await pipe.execute()
    except Exception:
        logger.warning("Redis error recording failed login for %s", email, exc_info=True)


async def clear_failed_logins(email: str) -> None:
    """Reset the counter on successful login."""
    if not _redis:
        return
    try:
        await _redis.delete(f"login_attempts:{email.lower()}")
    except Exception:
        logger.warning("Redis error clearing login attempts for %s", email, exc_info=True)


async def is_account_locked(email: str) -> bool:
    """Return True if the account has exceeded MAX_LOGIN_ATTEMPTS.

    Falls back to False (fail-open) if Redis is unavailable so that
    users are not permanently locked out when Redis is down.
    """
    if not _redis:
        return False
    try:
        attempts = await _redis.get(f"login_attempts:{email.lower()}")
        return attempts is not None and int(attempts) >= MAX_LOGIN_ATTEMPTS
    except Exception:
        logger.warning("Redis error checking lockout for %s", email, exc_info=True)
        return False


async def get_failed_login_count(email: str) -> int:
    """Return the current failed-login counter for *email* (0 if none)."""
    if not _redis:
        return 0
    try:
        attempts = await _redis.get(f"login_attempts:{email.lower()}")
        return int(attempts) if attempts is not None else 0
    except Exception:
        logger.warning("Redis error reading attempts for %s", email, exc_info=True)
        return 0
