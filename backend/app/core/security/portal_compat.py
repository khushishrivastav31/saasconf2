"""Dual-token compatibility layer for the unified portal.

During the portal-unification migration, two JWT issuers remain live:

- ``applicant_access`` — legacy CFP applicant tokens, ``sub`` is ``cfp_applicants.id``.
- ``portal_access`` — unified portal tokens, ``sub`` is ``portal_users.id``.

Both are signed with the same ``JWT_SECRET_KEY`` + algorithm, so we can decode
either and branch on the ``type`` claim at the dependency layer. This keeps
legacy CFP-only endpoints working for unmigrated applicants while the unified
frontend and new callers issue ``portal_access`` tokens.
"""

from __future__ import annotations

from typing import Any, Literal

import jwt
from jwt.exceptions import PyJWTError

from app.config import get_settings
from app.core.exceptions import AuthenticationError

settings = get_settings()

PortalTokenType = Literal["applicant_access", "portal_access"]

_ALLOWED_TYPES: frozenset[str] = frozenset({"applicant_access", "portal_access"})


def decode_portal_or_applicant_token(token: str) -> tuple[PortalTokenType, dict[str, Any]]:
    """Decode a JWT that may be either an applicant_access or portal_access token.

    Returns a tuple of (token_type, payload). The caller is responsible for
    resolving ``payload["sub"]`` against the correct entity table.
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except PyJWTError as e:
        raise AuthenticationError(f"Invalid or expired token: {e!s}") from e

    token_type = payload.get("type")
    if token_type not in _ALLOWED_TYPES:
        raise AuthenticationError("Invalid token type. Expected applicant_access or portal_access.")

    return token_type, payload  # type: ignore[return-value]
