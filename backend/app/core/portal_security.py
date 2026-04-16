"""Security module for unified portal — JWT tokens for portal_users."""

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


def create_portal_access_token(
    portal_user_id: UUID,
    tenant_id: UUID,
) -> str:
    """Create a JWT access token for a portal user."""
    expire = utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {
        "sub": str(portal_user_id),
        "tenant_id": str(tenant_id),
        "exp": expire,
        "iat": utcnow(),
        "type": "portal_access",
    }

    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_portal_refresh_token(portal_user_id: UUID) -> tuple[str, str, datetime]:
    """Create a refresh token for a portal user.

    Returns:
        Tuple of (raw_token, token_hash, expiry_datetime)
    """
    expire = utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    jti = secrets.token_urlsafe(32)

    payload = {
        "sub": str(portal_user_id),
        "exp": expire,
        "iat": utcnow(),
        "type": "portal_refresh",
        "jti": jti,
    }

    raw_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    return raw_token, token_hash, expire


def decode_portal_token(token: str, token_type: str = "portal_access") -> dict[str, Any]:
    """Decode and validate a portal JWT token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

        if payload.get("type") != token_type:
            raise AuthenticationError(f"Invalid token type. Expected {token_type}.")

        return payload

    except PyJWTError as e:
        raise AuthenticationError(f"Invalid or expired token: {e!s}") from e


def generate_password_reset_token() -> tuple[str, str]:
    """Generate a password reset token.

    Returns:
        Tuple of (raw_token, token_hash)
    """
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    return raw_token, token_hash
