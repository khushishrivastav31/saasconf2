"""Shared helpers for the attendees sub-routers."""

from uuid import UUID

from sqlalchemy import select

from app.core.dependencies import DbSessionDep
from app.core.security.pii_crypto import hash_email
from app.models.training import Training
from app.models.training_attendee import TrainingAttendee
from app.models.training_program import ProgramYearTraining


async def get_or_create_central_attendee(
    db: DbSessionDep,
    tenant_id: UUID,
    first_name: str,
    last_name: str,
    email: str,
) -> TrainingAttendee:
    """Find or create a central TrainingAttendee record by (tenant_id, email_hash)."""
    result = await db.execute(
        select(TrainingAttendee).where(
            TrainingAttendee.tenant_id == tenant_id,
            TrainingAttendee.email_hash == hash_email(email),
        )
    )
    attendee = result.scalar_one_or_none()
    if attendee:
        if attendee.first_name != first_name or attendee.last_name != last_name:
            attendee.first_name = first_name
            attendee.last_name = last_name
        return attendee

    attendee = TrainingAttendee(
        tenant_id=tenant_id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        status="active",
    )
    db.add(attendee)
    await db.flush()
    return attendee


async def get_training_name_for_placement(db: DbSessionDep, placement_id: UUID | None) -> str:
    if not placement_id:
        return "—"
    result = await db.execute(
        select(Training.name)
        .join(ProgramYearTraining, ProgramYearTraining.training_id == Training.id)
        .where(ProgramYearTraining.id == placement_id)
    )
    name = result.scalar_one_or_none()
    return name or "Unknown"
