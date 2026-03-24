"""Shared helpers and constants for training endpoints."""

from datetime import date
from uuid import UUID

from sqlalchemy import literal

from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.models.training import Training
from app.schemas.conference import TeamMember
from app.schemas.training import TrainingResponse

MODULE_CODE = "trainings"


def _tenant_filter(current_user: CurrentUserDep):
    """Return a tenant filter clause. Super admins bypass the filter."""
    if current_user.is_super_admin:
        return literal(True)
    return Training.tenant_id == current_user.tenant_id


async def _get_accessible_training_ids(db: DbSessionDep, current_user: CurrentUserDep) -> list[UUID] | None:
    """
    Get list of training IDs the user can access.

    Returns None if user has access to all trainings (tenant_admin, super_admin).
    """
    if current_user.is_super_admin or current_user.is_tenant_admin:
        return None
    # For now, all users with module access see all trainings
    return None


def _build_training_response(training: Training) -> TrainingResponse:
    """Build a TrainingResponse from a Training model."""
    today = date.today()
    if not training.start_date:
        status = "draft"
    elif training.start_date > today:
        status = "upcoming"
    elif training.end_date and training.end_date < today:
        status = "past"
    elif training.start_date <= today <= (training.end_date or training.start_date):
        status = "ongoing"
    else:
        status = "draft"

    team_members = []
    for tm in training.team_members or []:
        first_name = tm.get("first_name") or "(Unknown)"
        team_members.append(
            TeamMember(
                first_name=first_name,
                last_name=tm.get("last_name", ""),
                email=tm.get("email"),
                phone=tm.get("phone"),
                role=tm.get("role"),
                is_manager=tm.get("is_manager", False),
            )
        )

    managers_count = sum(1 for tm in team_members if tm.is_manager)

    return TrainingResponse(
        id=training.id,
        tenant_id=training.tenant_id,
        name=training.name,
        slug=training.slug,
        abbreviation=training.abbreviation,
        description=training.description,
        content=training.content,
        duration=training.duration,
        website=training.website,
        color=training.color,
        logo_url=training.logo_url,
        regular_price=training.regular_price,
        early_bird_price=training.early_bird_price,
        language_id=training.language_id,
        language_name=training.language.name if training.language else None,
        second_language_id=training.second_language_id,
        second_language_name=training.second_language.name if training.second_language else None,
        syllabus_id=training.syllabus_id,
        syllabus_name=training.syllabus.name if training.syllabus else None,
        theme_id=training.theme_id,
        theme_name=training.theme.name if training.theme else None,
        certification_body_id=training.certification_body_id,
        certification_body_name=training.certification_body_rel.company_name
        if training.certification_body_rel
        else None,
        support_email=training.support_email,
        contact_email=training.contact_email,
        phone=training.phone,
        start_date=training.start_date,
        end_date=training.end_date,
        venue_name=training.venue_name,
        venue_address=training.venue_address,
        city=training.city,
        state=training.state,
        postal_code=training.postal_code,
        country=training.country,
        timezone=training.timezone,
        locale=training.locale,
        venue_type=training.venue_type,
        venue_url=training.venue_url,
        virtual_platform_url=training.virtual_platform_url,
        social_links=training.social_links or {},
        team_members=team_members,
        settings=training.settings or {},
        currency=training.currency,
        invoice_currency=training.invoice_currency,
        is_active=training.is_active,
        is_published=training.is_published,
        created_at=training.created_at,
        updated_at=training.updated_at,
        managers_count=managers_count,
        team_count=len(team_members),
        status=status,
    )
