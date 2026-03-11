"""Tests for registration security (app/core/registration_security.py).

Mostly unit tests. Some require a mock FastAPI Request object.
"""

import time
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from app.core.registration_security import (
    check_rate_limit,
    clear_rate_limits,
    is_disposable_email,
    validate_registration_security,
)


@pytest.fixture(autouse=True)
def _reset_rate_limits() -> None:  # type: ignore[misc]
    """Clear rate limit store before and after every test."""
    clear_rate_limits()
    yield  # type: ignore[misc]
    clear_rate_limits()


def _make_request(ip: str = "127.0.0.1") -> MagicMock:
    """Create a mock FastAPI Request with a client IP."""
    request = MagicMock()
    request.client.host = ip
    return request


# ── Disposable Email Checks ──────────────────────────────────────────


class TestIsDisposableEmail:
    def test_is_disposable_email_mailinator(self) -> None:
        assert is_disposable_email("test@mailinator.com") is True

    def test_is_disposable_email_gmail(self) -> None:
        assert is_disposable_email("user@gmail.com") is False

    def test_is_disposable_email_case_insensitive(self) -> None:
        # The function lower-cases the domain, so uppercase input should match
        assert is_disposable_email("user@MAILINATOR.COM") is True

    def test_is_disposable_email_yopmail(self) -> None:
        assert is_disposable_email("someone@yopmail.com") is True


# ── Rate Limiting ─────────────────────────────────────────────────────


class TestCheckRateLimit:
    @pytest.mark.asyncio
    async def test_check_rate_limit_allows_under_limit(self) -> None:
        # Two attempts should succeed (limit defaults to 3)
        await check_rate_limit("192.168.1.1", "registration")
        await check_rate_limit("192.168.1.1", "registration")
        # No exception => pass

    @pytest.mark.asyncio
    async def test_check_rate_limit_blocks_at_limit(self) -> None:
        for _ in range(3):
            await check_rate_limit("10.0.0.1", "registration")
        with pytest.raises(HTTPException) as exc_info:
            await check_rate_limit("10.0.0.1", "registration")
        assert exc_info.value.status_code == 429

    @pytest.mark.asyncio
    async def test_check_rate_limit_different_actions_independent(self) -> None:
        # Fill up "registration" action
        for _ in range(3):
            await check_rate_limit("10.0.0.2", "registration")
        # "login" action for the same identifier should still work
        await check_rate_limit("10.0.0.2", "login")

    @pytest.mark.asyncio
    async def test_clear_rate_limits_resets(self) -> None:
        for _ in range(3):
            await check_rate_limit("10.0.0.3", "registration")
        clear_rate_limits()
        # After clearing, should succeed again
        await check_rate_limit("10.0.0.3", "registration")


# ── Full Validation ───────────────────────────────────────────────────


class TestValidateRegistrationSecurity:
    @pytest.mark.asyncio
    async def test_validate_honeypot_filled_raises_400(self) -> None:
        request = _make_request()
        with pytest.raises(HTTPException) as exc_info:
            await validate_registration_security(
                request=request,
                billing_email="user@gmail.com",
                honeypot_field="bot-filled-value",
            )
        assert exc_info.value.status_code == 400
        assert "Invalid form submission" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_validate_too_fast_raises_400(self) -> None:
        request = _make_request()
        # Timestamp 2 seconds ago => too fast (< 5s threshold)
        with pytest.raises(HTTPException) as exc_info:
            await validate_registration_security(
                request=request,
                billing_email="user@gmail.com",
                form_start_timestamp=time.time() - 2,
            )
        assert exc_info.value.status_code == 400
        assert "too quickly" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_validate_disposable_email_raises_400(self) -> None:
        request = _make_request()
        with pytest.raises(HTTPException) as exc_info:
            await validate_registration_security(
                request=request,
                billing_email="bot@mailinator.com",
                form_start_timestamp=time.time() - 60,
            )
        assert exc_info.value.status_code == 400
        assert "Temporary email" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_validate_rate_limited_raises_429(self) -> None:
        request = _make_request(ip="10.0.0.99")
        # Exhaust the rate limit first
        for _ in range(3):
            await validate_registration_security(
                request=request,
                billing_email="user@gmail.com",
                form_start_timestamp=time.time() - 60,
            )
        with pytest.raises(HTTPException) as exc_info:
            await validate_registration_security(
                request=request,
                billing_email="user@gmail.com",
                form_start_timestamp=time.time() - 60,
            )
        assert exc_info.value.status_code == 429

    @pytest.mark.asyncio
    async def test_validate_all_clear_passes(self) -> None:
        request = _make_request()
        # No exception should be raised
        await validate_registration_security(
            request=request,
            billing_email="legit@company.com",
            honeypot_field=None,
            form_start_timestamp=time.time() - 60,
        )
