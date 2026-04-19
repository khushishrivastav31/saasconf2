"""FastAPI dependencies for applicant portal authentication."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError
from app.core.security.portal_compat import decode_portal_or_applicant_token
from app.db.session import get_db, set_rls_context
from app.models.cfp import CFPApplicant
from app.models.tenant import Tenant


class CurrentApplicant:
    """Container for current applicant context extracted from JWT."""

    def __init__(
        self,
        applicant_id: UUID,
        tenant_id: UUID,
        applicant: CFPApplicant,
    ):
        self.applicant_id = applicant_id
        self.tenant_id = tenant_id
        self.applicant = applicant


async def get_applicant_token_from_header(
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    """Extract token from Authorization header."""
    if not authorization:
        raise AuthenticationError("Authorization header missing")

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise AuthenticationError("Invalid authorization header format")

    return parts[1]


async def get_current_applicant(
    token: Annotated[str, Depends(get_applicant_token_from_header)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CurrentApplicant:
    """Get the current applicant from the JWT token.

    Accepts either the legacy ``applicant_access`` token (where ``sub`` is the
    CFPApplicant id) or the unified ``portal_access`` token (where ``sub`` is
    the linked PortalUser id). Portal-access tokens resolve to a CFPApplicant
    via ``portal_user_id`` — callers without a linked applicant row get 401,
    since this dependency exists only for CFP-applicant endpoints.
    """
    token_type, payload = decode_portal_or_applicant_token(token)

    tenant_id = UUID(payload["tenant_id"])

    # Check tenant is active
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant or not tenant.is_active:
        raise AuthenticationError("Organization account has been deactivated")

    sub_id = UUID(payload["sub"])

    if token_type == "applicant_access":
        result = await db.execute(
            select(CFPApplicant).where(
                CFPApplicant.id == sub_id,
                CFPApplicant.tenant_id == tenant_id,
            )
        )
    else:  # portal_access
        result = await db.execute(
            select(CFPApplicant).where(
                CFPApplicant.portal_user_id == sub_id,
                CFPApplicant.tenant_id == tenant_id,
            )
        )

    applicant = result.scalar_one_or_none()

    if not applicant:
        raise AuthenticationError("Applicant not found")

    # Set RLS context
    await set_rls_context(db, tenant_id=str(tenant_id), is_super_admin=False)

    return CurrentApplicant(
        applicant_id=applicant.id,  # type: ignore[arg-type]
        tenant_id=tenant_id,
        applicant=applicant,  # type: ignore[arg-type]
    )


# Type aliases
CurrentApplicantDep = Annotated[CurrentApplicant, Depends(get_current_applicant)]
DbSessionDep = Annotated[AsyncSession, Depends(get_db)]
