"""Security module - JWT tokens and password hashing."""

import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jwt.exceptions import PyJWTError

from app.config import get_settings
from app.core.exceptions import AuthenticationError
from app.core.utils import utcnow

settings = get_settings()

# Argon2 password hasher with secure defaults
ph = PasswordHasher(
    time_cost=3,  # Number of iterations
    memory_cost=65536,  # 64 MB memory usage
    parallelism=4,  # Number of parallel threads
)


def hash_password(password: str) -> str:
    """
    Hash a password using Argon2id.

    Args:
        password: Plain text password

    Returns:
        Hashed password string
    """
    return ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against its hash.

    Args:
        plain_password: Plain text password to verify
        hashed_password: Stored password hash

    Returns:
        True if password matches, False otherwise
    """
    try:
        ph.verify(hashed_password, plain_password)
        return True
    except VerifyMismatchError:
        return False


def create_access_token(
    user_id: UUID,
    tenant_id: UUID | None,
    role: str,
    modules: list[str] | None = None,
    is_tenant_super_user: bool = False,
    tenant_roles: list[dict[str, str]] | None = None,
    token_type: str = "access",
    expires_minutes: int | None = None,
) -> str:
    """
    Create a JWT access token.

    Args:
        user_id: User's UUID
        tenant_id: Tenant's UUID (None for super admin)
        role: User's role
        modules: List of module codes the user has access to
        is_tenant_super_user: Whether the user is the designated super user for their tenant
        tenant_roles: List of {"scope": ..., "level": ...} dicts for module-scoped roles
        token_type: Token type claim (default ``"access"``, also ``"mfa_pending"``)
        expires_minutes: Override default expiry (for short-lived MFA tokens)

    Returns:
        Encoded JWT token
    """
    minutes = expires_minutes if expires_minutes is not None else settings.ACCESS_TOKEN_EXPIRE_MINUTES
    expire = utcnow() + timedelta(minutes=minutes)

    payload = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id) if tenant_id else None,
        "role": role,
        "modules": modules or [],
        "is_tenant_super_user": is_tenant_super_user,
        "tenant_roles": tenant_roles or [],
        "exp": expire,
        "iat": utcnow(),
        "type": token_type,
        "jti": secrets.token_urlsafe(16),
    }

    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: UUID) -> tuple[str, str, datetime]:
    """
    Create a refresh token.

    Args:
        user_id: User's UUID

    Returns:
        Tuple of (raw_token, token_hash, expiry_datetime)
    """
    expire = utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    # Generate a unique token ID
    jti = secrets.token_urlsafe(32)

    payload = {
        "sub": str(user_id),
        "exp": expire,
        "iat": utcnow(),
        "type": "refresh",
        "jti": jti,
    }

    raw_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    # Hash the token for storage
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    return raw_token, token_hash, expire


def decode_token(token: str, token_type: str = "access") -> dict[str, Any]:
    """
    Decode and validate a JWT token.

    Args:
        token: JWT token string
        token_type: Expected token type ('access' or 'refresh')

    Returns:
        Decoded token payload

    Raises:
        AuthenticationError: If token is invalid or expired
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

        # Verify token type
        if payload.get("type") != token_type:
            raise AuthenticationError(f"Invalid token type. Expected {token_type}.")

        return payload

    except PyJWTError as e:
        raise AuthenticationError(f"Invalid or expired token: {e!s}") from e


def hash_token(token: str) -> str:
    """
    Hash a token for storage/lookup.

    Args:
        token: Raw token string

    Returns:
        SHA256 hash of the token
    """
    return hashlib.sha256(token.encode()).hexdigest()


def generate_secure_password(length: int = 16) -> str:
    """
    Generate a cryptographically secure random password.

    Args:
        length: Password length (default 16)

    Returns:
        Random password string
    """
    return secrets.token_urlsafe(length)
