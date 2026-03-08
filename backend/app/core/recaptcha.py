"""
Google reCAPTCHA v3 Validation

Validates reCAPTCHA tokens to prevent bot submissions on public endpoints.
"""

import httpx
from fastapi import HTTPException

# Google reCAPTCHA verify endpoint
RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify"


async def validate_recaptcha(token: str, secret_key: str, threshold: float = 0.5) -> None:
    """
    Validate Google reCAPTCHA v3 token.

    Args:
        token: reCAPTCHA token from frontend
        secret_key: Secret key for reCAPTCHA verification
        threshold: Minimum score required (0.0 to 1.0)

    Raises:
        HTTPException: If validation fails or score is below threshold
    """
    if not token:
        raise HTTPException(status_code=400, detail="reCAPTCHA token required")

    if not secret_key:
        # In development/testing, allow if no secret configured
        return

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                RECAPTCHA_VERIFY_URL,
                data={"secret": secret_key, "response": token},
                timeout=10.0,
            )
            response.raise_for_status()
            result = response.json()

        if not result.get("success"):
            error_codes = result.get("error-codes", [])
            raise HTTPException(
                status_code=400,
                detail=f"reCAPTCHA validation failed: {', '.join(error_codes)}",
            )

        score = result.get("score", 0.0)
        if score < threshold:
            raise HTTPException(
                status_code=400,
                detail=f"reCAPTCHA score too low: {score} < {threshold}. Please try again.",
            )

    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"reCAPTCHA service unavailable: {e!s}") from e
