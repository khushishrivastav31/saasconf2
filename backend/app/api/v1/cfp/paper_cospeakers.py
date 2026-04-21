"""Co-speaker invitation endpoints (accept, decline, list my invitations)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.dependencies import (
    CurrentUserDep,
    DbSessionDep,
    TenantAdminDep,
    require_module,
)
from app.core.exceptions import NotFoundError
from app.core.security.pii_crypto import hash_email
from app.models.cfp import (
    CFPApplicant,
    CFPPaper,
    CFPPaperCospeaker,
)
from app.schemas.cfp import (
    CospeakerInvitationListResponse,
    CospeakerInvitationResponse,
)

from .shared import MODULE_CODE

router = APIRouter()


# NOTE: /papers/my-invitations is a literal path that must be registered
# BEFORE any /papers/{paper_id} routes. This module is included first in
# __init__.py to ensure correct route ordering.


@router.get(
    "/papers/my-invitations",
    response_model=CospeakerInvitationListResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_my_invitations(
    current_user: CurrentUserDep,
    db: DbSessionDep,
    applicant_email: str | None = None,
) -> CospeakerInvitationListResponse:
    """List co-speaker invitations for an applicant."""
    # Find the applicant by email
    if not applicant_email:
        raise HTTPException(status_code=400, detail="applicant_email is required")

    applicant_result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.email_hash == hash_email(applicant_email),
            CFPApplicant.tenant_id == current_user.tenant_id,
        )
    )
    applicant = applicant_result.scalar_one_or_none()
    if not applicant:
        return CospeakerInvitationListResponse(items=[], total=0)

    # Get all cospeaker associations for this applicant
    result = await db.execute(
        select(CFPPaperCospeaker)
        .options(
            selectinload(CFPPaperCospeaker.paper).selectinload(CFPPaper.cfp),
            selectinload(CFPPaperCospeaker.paper).selectinload(CFPPaper.main_speaker),
        )
        .where(
            CFPPaperCospeaker.applicant_id == applicant.id,
            CFPPaperCospeaker.invitation_status == "pending",
        )
    )
    associations = list(result.scalars().all())

    items = [
        CospeakerInvitationResponse(
            paper_id=assoc.paper_id,
            paper_title=assoc.paper.title,
            cfp_title=assoc.paper.cfp.title if assoc.paper.cfp else None,
            main_speaker_first_name=assoc.paper.main_speaker.first_name if assoc.paper.main_speaker else None,
            main_speaker_last_name=assoc.paper.main_speaker.last_name if assoc.paper.main_speaker else None,
            invitation_status=assoc.invitation_status,
            invited_at=assoc.invited_at,
        )
        for assoc in associations
    ]

    return CospeakerInvitationListResponse(items=items, total=len(items))


@router.post("/papers/{paper_id}/cospeakers/{applicant_id}/accept", dependencies=[Depends(require_module(MODULE_CODE))])
async def accept_cospeaker_invitation(
    paper_id: UUID,
    applicant_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Accept a co-speaker invitation."""
    result = await db.execute(
        select(CFPPaperCospeaker).where(
            CFPPaperCospeaker.paper_id == paper_id,
            CFPPaperCospeaker.applicant_id == applicant_id,
        )
    )
    assoc = result.scalar_one_or_none()
    if not assoc:
        raise NotFoundError("Invitation not found")

    assoc.invitation_status = "accepted"
    assoc.responded_at = func.now()
    await db.commit()

    return {"message": "Invitation accepted"}


@router.post(
    "/papers/{paper_id}/cospeakers/{applicant_id}/decline", dependencies=[Depends(require_module(MODULE_CODE))]
)
async def decline_cospeaker_invitation(
    paper_id: UUID,
    applicant_id: UUID,
    current_user: TenantAdminDep,
    db: DbSessionDep,
) -> dict:
    """Decline a co-speaker invitation."""
    result = await db.execute(
        select(CFPPaperCospeaker).where(
            CFPPaperCospeaker.paper_id == paper_id,
            CFPPaperCospeaker.applicant_id == applicant_id,
        )
    )
    assoc = result.scalar_one_or_none()
    if not assoc:
        raise NotFoundError("Invitation not found")

    assoc.invitation_status = "declined"
    assoc.responded_at = func.now()
    await db.commit()

    return {"message": "Invitation declined"}
