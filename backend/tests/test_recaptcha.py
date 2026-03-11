"""Tests for reCAPTCHA validation (app/core/recaptcha.py).

All Google API calls are mocked via unittest.mock.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException

from app.core.recaptcha import validate_recaptcha


class TestValidateRecaptcha:
    @pytest.mark.asyncio
    async def test_empty_token_raises_400(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            await validate_recaptcha(token="", secret_key="secret123")
        assert exc_info.value.status_code == 400
        assert "reCAPTCHA token required" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_no_secret_key_skips(self) -> None:
        # Dev mode: no secret key configured => validation passes silently
        await validate_recaptcha(token="some-token", secret_key="")

    @pytest.mark.asyncio
    async def test_success_above_threshold(self) -> None:
        mock_response = MagicMock()
        mock_response.json.return_value = {"success": True, "score": 0.9}
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("app.core.recaptcha.httpx.AsyncClient", return_value=mock_client):
            # Should not raise
            await validate_recaptcha(token="valid-token", secret_key="secret123")

    @pytest.mark.asyncio
    async def test_failure_below_threshold(self) -> None:
        mock_response = MagicMock()
        mock_response.json.return_value = {"success": True, "score": 0.3}
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("app.core.recaptcha.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(HTTPException) as exc_info:
                await validate_recaptcha(token="low-score", secret_key="secret123")
            assert exc_info.value.status_code == 400
            assert "score too low" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_not_success_raises_400(self) -> None:
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "success": False,
            "error-codes": ["invalid-input-response"],
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("app.core.recaptcha.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(HTTPException) as exc_info:
                await validate_recaptcha(token="bad-token", secret_key="secret123")
            assert exc_info.value.status_code == 400
            assert "validation failed" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_api_failure_raises_503(self) -> None:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=httpx.HTTPError("Connection refused"))

        with patch("app.core.recaptcha.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(HTTPException) as exc_info:
                await validate_recaptcha(token="token", secret_key="secret123")
            assert exc_info.value.status_code == 503
            assert "service unavailable" in str(exc_info.value.detail)

    @pytest.mark.asyncio
    async def test_custom_threshold(self) -> None:
        mock_response = MagicMock()
        mock_response.json.return_value = {"success": True, "score": 0.6}
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("app.core.recaptcha.httpx.AsyncClient", return_value=mock_client):
            # Score 0.6 passes with threshold 0.5 (default)
            await validate_recaptcha(token="ok", secret_key="secret123", threshold=0.5)

            # Score 0.6 fails with threshold 0.7
            with pytest.raises(HTTPException) as exc_info:
                await validate_recaptcha(
                    token="ok", secret_key="secret123", threshold=0.7
                )
            assert exc_info.value.status_code == 400
            assert "score too low" in str(exc_info.value.detail)
