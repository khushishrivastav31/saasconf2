"""Tenant-wide alumni list aggregated from past conferences.

Mounts at /alumni (not to be confused with the legacy conference-scoped
/conferences/{conference_id}/alumni CRUD router). This module provides
read-only aggregation across all past conferences for the tenant.

"Past" = conference.end_date < today. Null end_date means not ended.

Sources per conference:
- Attendees: Registration (status != cancelled)
- Speakers: main_speaker_id of accepted CFPPaper, or accepted CFPPaperCospeaker
- Committee: CFPCommitteeMember
"""

from __future__ import annotations

import csv
import io
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict
from sqlalchemy import (
    UUID as SA_UUID,
)
from sqlalchemy import (
    cast,
    distinct,
    func,
    literal,
    or_,
    select,
    union_all,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import DbSessionDep, TenantAdminDep
from app.core.file_validation import safe_content_disposition
from app.core.search import unaccent_ilike
from app.core.security.pii_crypto import decrypt_pii
from app.models.associations import ConferenceCFP
from app.models.cfp import CFPApplicant, CFPCommitteeMember, CFPPaper, CFPPaperCospeaker
from app.models.cfp_papers import CospeakerInvitationStatus, PaperStatus
from app.models.conference import Conference
from app.models.registration import Registration, RegistrationStatus

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────


class ConferenceRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    year: int | None


class AlumniEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    email_hash: str
    first_name: str | None
    last_name: str | None
    email: str | None
    roles: list[str]
    conferences: list[ConferenceRef]


class AlumniListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[AlumniEntry]
    total: int


# ── Private sub-select builders ───────────────────────────────────────────────


def _past_conference_ids(tenant_id: uuid.UUID):
    """Subquery: IDs of conferences belonging to this tenant that have ended."""
    today = date.today()
    return (
        select(Conference.id)
        .where(
            Conference.tenant_id == tenant_id,
            Conference.end_date.is_not(None),
            Conference.end_date < today,
        )
        .scalar_subquery()
    )


def _attendee_select(tenant_id: uuid.UUID, past_ids):
    """Non-cancelled registrations in past conferences."""
    return select(
        Registration.email_hash,
        Registration.first_name,
        Registration.last_name,
        literal("attendee").label("role"),
        Registration.conference_id,
    ).where(
        Registration.tenant_id == tenant_id,
        Registration.conference_id.in_(past_ids),
        Registration.status != RegistrationStatus.CANCELLED.value,
        Registration.email_hash.is_not(None),
    )


def _main_speaker_select(tenant_id: uuid.UUID, past_ids):
    """Main speakers of accepted papers linked to past conferences."""
    return (
        select(
            CFPApplicant.email_hash,
            CFPApplicant.first_name,
            CFPApplicant.last_name,
            literal("speaker").label("role"),
            ConferenceCFP.conference_id,
        )
        .join(CFPPaper, CFPPaper.main_speaker_id == CFPApplicant.id)
        .join(ConferenceCFP, ConferenceCFP.cfp_id == CFPPaper.cfp_id)
        .where(
            CFPApplicant.tenant_id == tenant_id,
            CFPPaper.status == PaperStatus.ACCEPTED.value,
            ConferenceCFP.conference_id.in_(past_ids),
            CFPApplicant.email_hash.is_not(None),
        )
    )


def _co_speaker_select(tenant_id: uuid.UUID, past_ids):
    """Accepted co-speakers of accepted papers linked to past conferences."""
    return (
        select(
            CFPApplicant.email_hash,
            CFPApplicant.first_name,
            CFPApplicant.last_name,
            literal("speaker").label("role"),
            ConferenceCFP.conference_id,
        )
        .join(CFPPaperCospeaker, CFPPaperCospeaker.applicant_id == CFPApplicant.id)
        .join(CFPPaper, CFPPaper.id == CFPPaperCospeaker.paper_id)
        .join(ConferenceCFP, ConferenceCFP.cfp_id == CFPPaper.cfp_id)
        .where(
            CFPApplicant.tenant_id == tenant_id,
            CFPPaperCospeaker.invitation_status == CospeakerInvitationStatus.ACCEPTED.value,
            CFPPaper.status == PaperStatus.ACCEPTED.value,
            ConferenceCFP.conference_id.in_(past_ids),
            CFPApplicant.email_hash.is_not(None),
        )
    )


def _committee_select(tenant_id: uuid.UUID, past_ids):
    """Committee members of past conferences."""
    return (
        select(
            CFPApplicant.email_hash,
            CFPApplicant.first_name,
            CFPApplicant.last_name,
            literal("committee").label("role"),
            CFPCommitteeMember.conference_id,
        )
        .join(CFPCommitteeMember, CFPCommitteeMember.applicant_id == CFPApplicant.id)
        .where(
            CFPApplicant.tenant_id == tenant_id,
            CFPCommitteeMember.conference_id.in_(past_ids),
            CFPApplicant.email_hash.is_not(None),
        )
    )


# ── Core aggregation query ────────────────────────────────────────────────────


def _build_aggregated_query(
    tenant_id: uuid.UUID,
    conference_id: uuid.UUID | None = None,
    role: str | None = None,
    search: str | None = None,
):
    """Build the grouped alumni query with optional filters.

    Returns a select that yields rows of:
        (email_hash, first_name, last_name, roles[], conference_ids[])
    """
    past = _past_conference_ids(tenant_id)

    unioned = union_all(
        _attendee_select(tenant_id, past),
        _main_speaker_select(tenant_id, past),
        _co_speaker_select(tenant_id, past),
        _committee_select(tenant_id, past),
    ).subquery()

    grouped = (
        select(
            unioned.c.email_hash,
            func.min(unioned.c.first_name).label("first_name"),
            func.min(unioned.c.last_name).label("last_name"),
            func.array_agg(distinct(unioned.c.role)).label("roles"),
            func.array_agg(distinct(unioned.c.conference_id)).label("conference_ids"),
        ).group_by(unioned.c.email_hash)
    ).subquery()

    q = select(
        grouped.c.email_hash,
        grouped.c.first_name,
        grouped.c.last_name,
        grouped.c.roles,
        grouped.c.conference_ids,
    ).select_from(grouped)

    if conference_id is not None:
        q = q.where(
            func.array_position(
                grouped.c.conference_ids,
                cast(conference_id, SA_UUID(as_uuid=True)),
            ).is_not(None)
        )

    if role is not None:
        q = q.where(func.array_position(grouped.c.roles, role).is_not(None))

    if search:
        q = q.where(
            or_(
                unaccent_ilike(grouped.c.first_name, search),
                unaccent_ilike(grouped.c.last_name, search),
            )
        )

    return q


# ── Secondary lookups ─────────────────────────────────────────────────────────


async def _resolve_emails(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    email_hashes: list[str],
) -> dict[str, str | None]:
    """Return {email_hash: email} for all known hashes.

    Priority:
    1. Registration (plaintext email column)
    2. CFPApplicant (encrypted email column — decrypted in Python)
    """
    if not email_hashes:
        return {}

    result: dict[str, str | None] = {}

    # 1. Plaintext emails from registrations
    rows = await db.execute(
        select(Registration.email_hash, Registration.email)
        .where(
            Registration.tenant_id == tenant_id,
            Registration.email_hash.in_(email_hashes),
        )
        .distinct(Registration.email_hash)
    )
    for row in rows:
        result[row.email_hash] = row.email

    # 2. Fill remaining from CFPApplicant (encrypted)
    missing = [h for h in email_hashes if h not in result]
    if missing:
        rows = await db.execute(
            select(CFPApplicant.email_hash, CFPApplicant.email_encrypted)
            .where(
                CFPApplicant.tenant_id == tenant_id,
                CFPApplicant.email_hash.in_(missing),
            )
            .distinct(CFPApplicant.email_hash)
        )
        for row in rows:
            if row.email_hash not in result:
                try:
                    result[row.email_hash] = decrypt_pii(row.email_encrypted) if row.email_encrypted else None
                except ValueError:
                    result[row.email_hash] = None

    return result


async def _resolve_conferences(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    conference_ids: list[uuid.UUID],
) -> dict[uuid.UUID, ConferenceRef]:
    """Return {conference_id: ConferenceRef} for all given IDs."""
    if not conference_ids:
        return {}

    rows = await db.execute(
        select(Conference.id, Conference.name, Conference.end_date, Conference.start_date).where(
            Conference.tenant_id == tenant_id,
            Conference.id.in_(conference_ids),
        )
    )
    result: dict[uuid.UUID, ConferenceRef] = {}
    for row in rows:
        year_date = row.end_date or row.start_date
        result[row.id] = ConferenceRef(
            id=row.id,
            name=row.name.strip(),
            year=year_date.year if year_date else None,
        )
    return result


# ── Route handlers ────────────────────────────────────────────────────────────


@router.get("", response_model=AlumniListResponse)
async def list_alumni(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    conference_id: uuid.UUID | None = Query(None),
    role: Literal["attendee", "speaker", "committee"] | None = Query(None),
    search: str | None = Query(None, max_length=200),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> AlumniListResponse:
    tenant_id = current_user.require_tenant_id()

    base_q = _build_aggregated_query(tenant_id, conference_id, role, search)

    total_result = await db.execute(select(func.count()).select_from(base_q.subquery()))
    total = total_result.scalar_one()

    rows = (await db.execute(base_q.offset(skip).limit(limit))).all()

    # Batch-resolve emails and conferences
    all_hashes = [r.email_hash for r in rows]
    all_conf_ids: list[uuid.UUID] = []
    for r in rows:
        all_conf_ids.extend(r.conference_ids)
    all_conf_ids = list(set(all_conf_ids))

    emails = await _resolve_emails(db, tenant_id, all_hashes)
    conferences = await _resolve_conferences(db, tenant_id, all_conf_ids)

    items = [
        AlumniEntry(
            email_hash=r.email_hash,
            first_name=r.first_name,
            last_name=r.last_name,
            email=emails.get(r.email_hash),
            roles=list(r.roles),
            conferences=[conferences[cid] for cid in r.conference_ids if cid in conferences],
        )
        for r in rows
    ]

    return AlumniListResponse(items=items, total=total)


@router.get("/export.csv")
async def export_alumni_csv(
    current_user: TenantAdminDep,
    db: DbSessionDep,
    conference_id: uuid.UUID | None = Query(None),
    role: Literal["attendee", "speaker", "committee"] | None = Query(None),
    search: str | None = Query(None, max_length=200),
) -> StreamingResponse:
    tenant_id = current_user.require_tenant_id()

    base_q = _build_aggregated_query(tenant_id, conference_id, role, search).limit(50_000)
    rows = (await db.execute(base_q)).all()

    all_hashes = [r.email_hash for r in rows]
    all_conf_ids = list({cid for r in rows for cid in r.conference_ids})

    emails = await _resolve_emails(db, tenant_id, all_hashes)
    conferences = await _resolve_conferences(db, tenant_id, all_conf_ids)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["first_name", "last_name", "email", "roles", "conferences"])
    for r in rows:
        conf_names = "; ".join(
            f"{conferences[cid].name.strip()} {conferences[cid].year}"
            if conferences[cid].year
            else conferences[cid].name.strip()
            for cid in r.conference_ids
            if cid in conferences
        )
        writer.writerow(
            [
                r.first_name or "",
                r.last_name or "",
                emails.get(r.email_hash) or "",
                "; ".join(r.roles),
                conf_names,
            ]
        )

    csv_bytes = b"\xef\xbb\xbf" + buf.getvalue().encode("utf-8")
    return StreamingResponse(
        iter([csv_bytes]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": safe_content_disposition("alumni.csv")},
    )
