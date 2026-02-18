"""FastAPI dependencies for applicant portal authentication."""

from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import decode_applicant_token
from app.core.exceptions import AuthenticationError
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
    """Get the current applicant from the JWT token."""
    payload = decode_applicant_token(token, token_type="applicant_access")

    applicant_id = UUID(payload["sub"])
    tenant_id = UUID(payload["tenant_id"])

    # Check tenant is active
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant or not tenant.is_active:
        raise AuthenticationError("Organization account has been deactivated")

    # Load applicant
    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id == applicant_id,
            CFPApplicant.tenant_id == tenant_id,
        )
    )
    applicant = result.scalar_one_or_none()

    if not applicant:
        raise AuthenticationError("Applicant not found")

    # Set RLS context
    await set_rls_context(db, tenant_id=str(tenant_id), is_super_admin=False)

    return CurrentApplicant(
        applicant_id=applicant_id,
        tenant_id=tenant_id,
        applicant=applicant,  # type: ignore[arg-type]
    )


# Type aliases
CurrentApplicantDep = Annotated[CurrentApplicant, Depends(get_current_applicant)]
DbSessionDep = Annotated[AsyncSession, Depends(get_db)]
