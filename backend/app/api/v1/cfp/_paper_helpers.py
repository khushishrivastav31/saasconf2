"""Shared validation and sync helpers for paper create / update endpoints."""

import html as html_lib
import re
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.models.cfp import (
    CFPApplicant,
    CFPPaperCospeaker,
    CFPTopic,
    cfp_paper_topics,
)
from app.models.settings import SessionType

# Regex to strip HTML tags for plain-text character counting
_HTML_TAG_RE = re.compile(r"<[^>]+>")


def strip_html_for_char_count(html: str | None) -> str:
    """Strip HTML tags and return plain text for character counting.

    Args:
        html: HTML string (or None).

    Returns:
        Plain text with tags removed and whitespace trimmed.
    """
    if not html:
        return ""
    return _HTML_TAG_RE.sub("", html).strip()


# Built-in fields whose values are stored as HTML (rendered by RichTextEditor).
HTML_PAPER_FIELDS: frozenset[str] = frozenset({"abstract_short", "abstract_long", "learning_objectives"})


def paper_field_is_blank(field_key: str, value: object) -> bool:
    """Return True when a paper field value should be considered empty for required-field checks.

    HTML fields can store visually-empty markup like ``<p></p>`` or ``<p>&nbsp;</p>``
    which are truthy strings but render blank. This helper strips tags and HTML entities
    before checking emptiness so those variants are correctly treated as missing.
    """
    if value is None:
        return True
    if field_key in HTML_PAPER_FIELDS:
        plain = strip_html_for_char_count(str(value))
        # Decode HTML entities (&nbsp; → \xa0) then strip non-breaking whitespace.
        return html_lib.unescape(plain).replace("\xa0", " ").strip() == ""
    if isinstance(value, (list, tuple, set)):
        return len(value) == 0
    return not str(value).strip()


async def validate_main_speaker(db: AsyncSession, speaker_id: UUID, tenant_id: UUID) -> None:
    """Validate main speaker exists and belongs to tenant.

    Raises ``NotFoundError`` when the applicant cannot be found.
    """
    result = await db.execute(
        select(CFPApplicant).where(
            CFPApplicant.id == speaker_id,
            CFPApplicant.tenant_id == tenant_id,
        )
    )
    if not result.scalar_one_or_none():
        raise NotFoundError(f"Applicant with ID '{speaker_id}' not found")


async def validate_co_speakers(
    db: AsyncSession,
    co_speaker_ids: list[UUID],
    main_speaker_id: UUID,
    tenant_id: UUID,
) -> None:
    """Validate co-speakers exist, belong to tenant, and exclude main speaker.

    Raises ``ValidationError`` if the main speaker is in the list, or
    ``NotFoundError`` for any co-speaker that cannot be found.
    """
    if main_speaker_id in co_speaker_ids:
        raise ValidationError("Main speaker cannot be a co-speaker")

    for co_speaker_id in co_speaker_ids:
        result = await db.execute(
            select(CFPApplicant).where(
                CFPApplicant.id == co_speaker_id,
                CFPApplicant.tenant_id == tenant_id,
            )
        )
        if not result.scalar_one_or_none():
            raise NotFoundError(f"Co-speaker with ID '{co_speaker_id}' not found")


async def validate_session_type(db: AsyncSession, session_type_id: UUID, tenant_id: UUID) -> None:
    """Validate session type exists, is active, and is CFP-eligible.

    Raises ``ValidationError`` when the session type is missing or ineligible.
    """
    result = await db.execute(
        select(SessionType).where(
            SessionType.id == session_type_id,
            SessionType.tenant_id == tenant_id,
            SessionType.is_active == True,
            SessionType.cfp_eligible == True,
        )
    )
    if not result.scalar_one_or_none():
        raise ValidationError("Invalid or ineligible session type")


async def validate_topics(db: AsyncSession, topic_ids: list[UUID], tenant_id: UUID) -> None:
    """Validate all topics exist and belong to tenant.

    Raises ``NotFoundError`` for any topic that cannot be found.
    """
    for topic_id in topic_ids:
        result = await db.execute(
            select(CFPTopic).where(
                CFPTopic.id == topic_id,
                CFPTopic.tenant_id == tenant_id,
            )
        )
        if not result.scalar_one_or_none():
            raise NotFoundError(f"Topic with ID '{topic_id}' not found")


async def sync_paper_co_speakers(db: AsyncSession, paper_id: UUID, co_speaker_ids: list[UUID]) -> None:
    """Delete existing co-speakers for a paper and create new ones.

    For newly-created papers the delete is a harmless no-op.  Each
    co-speaker is assigned a ``sort_order`` matching its position in the
    list and an initial ``invitation_status`` of ``"pending"``.
    """
    await db.execute(delete(CFPPaperCospeaker).where(CFPPaperCospeaker.paper_id == paper_id))

    for idx, co_speaker_id in enumerate(co_speaker_ids):
        cospeaker = CFPPaperCospeaker(
            paper_id=paper_id,
            applicant_id=co_speaker_id,
            sort_order=idx,
            invitation_status="pending",
        )
        db.add(cospeaker)


async def sync_paper_topics(db: AsyncSession, paper_id: UUID, topic_ids: list[UUID]) -> None:
    """Delete existing topic associations for a paper and create new ones.

    For newly-created papers the delete is a harmless no-op.
    """
    await db.execute(cfp_paper_topics.delete().where(cfp_paper_topics.c.paper_id == paper_id))

    for topic_id in topic_ids:
        await db.execute(
            cfp_paper_topics.insert().values(
                paper_id=paper_id,
                topic_id=topic_id,
            )
        )
