"""
Public Registration Security

Multi-layered security validation for public registration portal.
Implements OWASP best practices for public-facing forms.
"""

import time
from collections import defaultdict

from fastapi import HTTPException, Request
from pydantic import EmailStr

from app.config import get_settings

# In-memory rate limiting (production should use Redis)
_rate_limit_store: defaultdict[str, list[float]] = defaultdict(list)

# Common disposable email domains (sample list - expand in production)
DISPOSABLE_EMAIL_DOMAINS = {
    "tempmail.com",
    "guerrillamail.com",
    "10minutemail.com",
    "throwaway.email",
    "mailinator.com",
    "trashmail.com",
    "temp-mail.org",
    "getnada.com",
    "maildrop.cc",
    "yopmail.com",
    "fakeinbox.com",
    "sharklasers.com",
    "guerrillamail.info",
    "grr.la",
    "guerrillamail.biz",
    "guerrillamail.de",
    "spam4.me",
    "mailnesia.com",
    "emailondeck.com",
}


def is_disposable_email(email: EmailStr) -> bool:
    """Check if email is from a disposable email provider."""
    domain = email.split("@")[1].lower() if "@" in email else ""
    return domain in DISPOSABLE_EMAIL_DOMAINS


async def check_rate_limit(
    identifier: str,
    action: str,
    limit: int = 3,
    window: int = 3600,
) -> None:
    """
    Check if rate limit is exceeded for an identifier.

    Args:
        identifier: Unique identifier (IP address, user ID, etc.)
        action: Action type (e.g., "registration")
        limit: Maximum number of attempts
        window: Time window in seconds

    Raises:
        HTTPException: If rate limit exceeded
    """
    key = f"{action}:{identifier}"
    now = time.time()

    # Clean old entries
    _rate_limit_store[key] = [timestamp for timestamp in _rate_limit_store[key] if now - timestamp < window]

    if len(_rate_limit_store[key]) >= limit:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Please try again in {window // 60} minutes.",
        )

    # Add new attempt
    _rate_limit_store[key].append(now)


async def validate_registration_security(
    request: Request,
    billing_email: EmailStr,
    honeypot_field: str | None = None,
    form_start_timestamp: float | None = None,
) -> None:
    """
    Multi-layered security validation for public registration.

    Implements:
    1. Honeypot field check (hidden field should be empty)
    2. Timestamp validation (form must be filled for ≥ 5 seconds)
    3. Disposable email check
    4. Rate limit check

    Args:
        request: FastAPI request object
        billing_email: Billing contact email
        honeypot_field: Value of honeypot field (should be empty)
        form_start_timestamp: Unix timestamp when form was rendered

    Raises:
        HTTPException: If any security check fails
    """
    client_ip = request.client.host if request.client else "unknown"

    # 1. Honeypot field check
    if honeypot_field:
        # Bot detected - silent fail with generic error
        raise HTTPException(status_code=400, detail="Invalid form submission")

    # 2. Timestamp validation (prevent instant submissions)
    if form_start_timestamp:
        time_taken = time.time() - form_start_timestamp
        if time_taken < 5:  # Form filled in less than 5 seconds
            raise HTTPException(
                status_code=400,
                detail="Form submitted too quickly. Please review your information.",
            )

    # 3. Disposable email check
    if is_disposable_email(billing_email):
        raise HTTPException(
            status_code=400,
            detail="Temporary email addresses are not allowed. Please use a permanent email address.",
        )

    # 4. Rate limit check (3 registrations per hour per IP) — skipped in debug mode
    if not get_settings().DEBUG:
        await check_rate_limit(client_ip, "registration", limit=3, window=3600)


# Helper function to clear rate limits (for testing)
def clear_rate_limits() -> None:
    """Clear all rate limit entries. Use for testing only."""
    _rate_limit_store.clear()
