"""Speaker notification emails for CFP paper accept/reject decisions.

Fires immediately when an admin transitions a paper to accepted/rejected via
``update_paper`` — as opposed to the batched program-publish flow in
``app/api/v1/program/publish.py``, which notifies speakers via a portal
message thread when the whole program is published. Both write to
``CFPPaper.notification_sent_at`` so a paper is only ever notified once,
whichever trigger fires first — see ``app.core.cfp_notifications``.
"""

import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.cfp_notifications import mark_paper_notified, paper_already_notified
from app.core.email import send_email
from app.core.email.templates import build_paper_decision_context, render_email
from app.core.html_sanitize import sanitize_html
from app.core.utils import utcnow
from app.models.cfp_applicants import CFPApplicant
from app.models.cfp_papers import CFPPaper, PaperStatus
from app.models.review import PaperReview, ReviewStatus
from app.schemas.email_template import EmailTemplateType

logger = logging.getLogger(__name__)

_TEMPLATE_BY_STATUS = {
    PaperStatus.ACCEPTED.value: EmailTemplateType.PAPER_ACCEPTANCE,
    PaperStatus.REJECTED.value: EmailTemplateType.PAPER_REJECTION,
}


async def build_speaker_feedback_html(db: AsyncSession, paper_id: UUID, tenant_id: UUID) -> str:
    """Sanitized HTML block of all submitted reviewer feedback for a paper.

    Empty string when there is no feedback — callers pass this straight into
    the ``Speaker Feedback`` placeholder, which is a no-op block when blank.
    """
    result = await db.execute(
        select(PaperReview.speaker_feedback).where(
            PaperReview.paper_id == paper_id,
            PaperReview.tenant_id == tenant_id,
            PaperReview.status == ReviewStatus.SUBMITTED.value,
            PaperReview.speaker_feedback.isnot(None),
        )
    )
    feedback_texts = [f.strip() for f in result.scalars().all() if f and f.strip()]
    if not feedback_texts:
        return ""
    return "".join(f"<p>{sanitize_html(text)}</p>" for text in feedback_texts)


def paper_speakers(paper: CFPPaper) -> list[CFPApplicant]:
    """Main speaker + all co-speakers, deduplicated, main speaker first.

    Requires ``paper.main_speaker`` and
    ``paper.cospeaker_associations.applicant`` to be eager-loaded (the
    standard ``_paper_eager_options`` does).
    """
    speakers: list[CFPApplicant] = []
    seen: set[UUID] = set()
    if paper.main_speaker is not None:
        speakers.append(paper.main_speaker)
        seen.add(paper.main_speaker.id)
    for assoc in paper.cospeaker_associations:
        applicant = assoc.applicant
        if applicant is not None and applicant.id not in seen:
            speakers.append(applicant)
            seen.add(applicant.id)
    return speakers


async def render_paper_decision_email(
    db: AsyncSession,
    paper: CFPPaper,
    speaker: CFPApplicant,
    *,
    tenant_id: UUID,
    conference_id: UUID | None,
    conference_name: str,
    feedback_html: str,
):
    """Render the accept/reject notification for one speaker of one paper.

    Shared by the actual send path and the speaker-portal preview endpoint
    so what a speaker previews is guaranteed identical to what was sent.
    """
    template_type = _TEMPLATE_BY_STATUS[paper.status]
    settings = get_settings()
    context = build_paper_decision_context(
        first_name=speaker.first_name,
        last_name=speaker.last_name or "",
        email=speaker.email or "",
        conference_name=conference_name,
        paper_title=paper.title,
        support_email=settings.RESEND_FROM_EMAIL,
        speaker_feedback=feedback_html,
    )
    return await render_email(
        db,
        template_type,
        context,
        conference_id=conference_id,
        tenant_id=tenant_id,
        raw_html_keys={"Paper List", "Speaker Feedback"},
    )


async def send_paper_decision_notifications(
    db: AsyncSession,
    paper: CFPPaper,
    *,
    tenant_id: UUID,
    conference_id: UUID | None,
    conference_name: str,
) -> int:
    """Email the speaker(s) of a paper that just moved to accepted/rejected.

    No-op (returns 0) if the paper isn't in a notifiable status, has no
    speakers with an email on file, or was already notified — either by an
    earlier call here or by the batched program-publish flow (see
    ``app.core.cfp_notifications``).
    """
    if paper.status not in _TEMPLATE_BY_STATUS or paper_already_notified(paper):
        return 0

    speakers = paper_speakers(paper)
    if not any(s.email for s in speakers):
        return 0

    feedback_html = await build_speaker_feedback_html(db, paper.id, tenant_id)

    sent = 0
    for speaker in speakers:
        email = speaker.email
        if not email:
            continue
        rendered = await render_paper_decision_email(
            db,
            paper,
            speaker,
            tenant_id=tenant_id,
            conference_id=conference_id,
            conference_name=conference_name,
            feedback_html=feedback_html,
        )
        success = await send_email(
            email,
            rendered.subject,
            rendered.body_html,
            rendered.body_text,
            db=db,
            tenant_id=tenant_id,
            conference_id=conference_id,
            email_type="paper_decision",
        )
        if success:
            sent += 1

    mark_paper_notified(paper, utcnow())
    return sent
