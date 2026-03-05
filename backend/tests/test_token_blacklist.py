"""Tests for Redis-based token blacklist."""

import asyncio
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio

from app.core.security import create_access_token, decode_token
from app.core.token_blacklist import (
    blacklist_token,
    close_redis,
    init_redis,
    is_token_blacklisted,
)


@pytest.fixture(autouse=True)
def _reset_redis():
    """Ensure Redis module state is reset between tests."""
    import app.core.token_blacklist as mod

    original = mod._redis
    yield
    mod._redis = original


class TestTokenBlacklistUnit:
    """Unit tests — no Redis required."""

    def test_access_token_has_jti(self):
        """Verify that new access tokens include a jti claim."""
        import uuid

        token = create_access_token(
            user_id=uuid.uuid4(),
            tenant_id=uuid.uuid4(),
            role="tenant_admin",
            modules=["conference"],
        )
        payload = decode_token(token, token_type="access")
        assert "jti" in payload
        assert isinstance(payload["jti"], str)
        assert len(payload["jti"]) > 0

    def test_each_token_gets_unique_jti(self):
        import uuid

        uid = uuid.uuid4()
        tid = uuid.uuid4()
        token1 = create_access_token(user_id=uid, tenant_id=tid, role="tenant_admin")
        token2 = create_access_token(user_id=uid, tenant_id=tid, role="tenant_admin")
        p1 = decode_token(token1, token_type="access")
        p2 = decode_token(token2, token_type="access")
        assert p1["jti"] != p2["jti"]

    @pytest.mark.asyncio
    async def test_blacklist_noop_when_redis_none(self):
        """blacklist_token should not raise when Redis is None."""
        import app.core.token_blacklist as mod

        mod._redis = None
        await blacklist_token("some-jti", 60)  # should not raise

    @pytest.mark.asyncio
    async def test_is_blacklisted_false_when_redis_none(self):
        """Should return False when Redis is unavailable (fail-open)."""
        import app.core.token_blacklist as mod

        mod._redis = None
        result = await is_token_blacklisted("some-jti")
        assert result is False

    @pytest.mark.asyncio
    async def test_fail_open_on_redis_error(self):
        """If Redis raises an exception, is_token_blacklisted returns False."""
        mock_redis = AsyncMock()
        mock_redis.get = AsyncMock(side_effect=ConnectionError("Redis down"))
        import app.core.token_blacklist as mod

        mod._redis = mock_redis
        result = await is_token_blacklisted("some-jti")
        assert result is False


class TestTokenBlacklistIntegration:
    """Integration tests — require Redis running on localhost:6379."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup_redis(self):
        """Connect to test Redis and clean up after."""
        await init_redis()
        import app.core.token_blacklist as mod

        if mod._redis is None:
            pytest.skip("Redis not available")
        yield
        # Clean up any test keys
        if mod._redis:
            keys = await mod._redis.keys("token_blacklist:test_*")
            if keys:
                await mod._redis.delete(*keys)
        await close_redis()

    @pytest.mark.asyncio
    async def test_blacklist_and_check(self):
        jti = "test_blacklist_check"
        assert await is_token_blacklisted(jti) is False
        await blacklist_token(jti, 60)
        assert await is_token_blacklisted(jti) is True

    @pytest.mark.asyncio
    async def test_blacklist_ttl_expiry(self):
        """Token with 1-second TTL should expire quickly."""
        jti = "test_ttl_expiry"
        await blacklist_token(jti, 1)
        assert await is_token_blacklisted(jti) is True
        await asyncio.sleep(1.5)
        assert await is_token_blacklisted(jti) is False

    @pytest.mark.asyncio
    async def test_non_blacklisted_token(self):
        jti = "test_not_blacklisted"
        assert await is_token_blacklisted(jti) is False
