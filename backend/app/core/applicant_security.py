"""Security module for applicant portal — JWT tokens and verification."""

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

import jwt
from jwt.exceptions import PyJWTError

from app.config import get_settings
from app.core.exceptions import AuthenticationError
from app.core.utils import utcnow

settings = get_settings()


def create_applicant_access_token(
    applicant_id: UUID,
    tenant_id: UUID,
) -> str:
    """Create a JWT access token for an applicant."""
    expire = utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {
        "sub": str(applicant_id),
        "tenant_id": str(tenant_id),
        "exp": expire,
        "iat": utcnow(),
        "type": "applicant_access",
    }

    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_applicant_refresh_token(applicant_id: UUID) -> tuple[str, str, datetime]:
    """Create a refresh token for an applicant.

    Returns:
        Tuple of (raw_token, token_hash, expiry_datetime)
    """
    expire = utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    jti = secrets.token_urlsafe(32)

    payload = {
        "sub": str(applicant_id),
        "exp": expire,
        "iat": utcnow(),
        "type": "applicant_refresh",
        "jti": jti,
    }

    raw_token = jwt.encode(
        payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )

    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    return raw_token, token_hash, expire


def decode_applicant_token(token: str, token_type: str = "applicant_access") -> dict[str, Any]:
    """Decode and validate an applicant JWT token."""
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )

        if payload.get("type") != token_type:
            raise AuthenticationError(f"Invalid token type. Expected {token_type}.")

        return payload

    except PyJWTError as e:
        raise AuthenticationError(f"Invalid or expired token: {e!s}") from e


def generate_email_verification_token() -> tuple[str, str]:
    """Generate an email verification token.

    Returns:
        Tuple of (raw_token, token_hash)
    """
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    return raw_token, token_hash
