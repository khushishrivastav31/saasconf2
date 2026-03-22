"""Badge generation endpoints.

Provides badge preview, single download, and bulk download for conference
registrations.
"""

from io import BytesIO
from uuid import UUID

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload

from app.core.conference_helpers import check_conference_admin
from app.core.dependencies import CurrentUserDep, DbSessionDep
from app.core.exceptions import NotFoundError, ValidationError
from app.models.conference import Conference
from app.models.registration import Registration
from app.schemas.badge import BadgeBulkRequest

router = APIRouter()


@router.get("/")
async def list_badge_registrations(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: str = "",
) -> dict:
    """List registrations for badge generation with search and pagination."""
    await check_conference_admin(conference_id, current_user, db)

    base_query = select(Registration).where(
        Registration.conference_id == conference_id,
        Registration.tenant_id == current_user.tenant_id,
        Registration.status != "cancelled",
    )

    if search:
        pattern = f"%{search}%"
        base_query = base_query.where(
            (Registration.first_name.ilike(pattern))
            | (Registration.last_name.ilike(pattern))
            | (Registration.email.ilike(pattern))
        )

    # Count
    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Fetch with billing profile
    items_query = (
        base_query.options(
            joinedload(Registration.billing_profile),
        )
        .order_by(Registration.last_name, Registration.first_name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(items_query)
    registrations = result.unique().scalars().all()

    # Load booking options in one query
    option_ids = {reg.booking_option_id for reg in registrations if reg.booking_option_id}
    options_map: dict[str, str] = {}
    if option_ids:
        from app.models.booking import BookingOption

        opts_result = await db.execute(
            select(BookingOption.id, BookingOption.name).where(BookingOption.id.in_(option_ids))
        )
        options_map = {str(row.id): row.name for row in opts_result.all()}

    items = []
    for reg in registrations:
        items.append(
            {
                "id": str(reg.id),
                "first_name": reg.first_name,
                "last_name": reg.last_name,
                "email": reg.email,
                "company_name": reg.billing_profile.company_name if reg.billing_profile else None,
                "booking_option": options_map.get(str(reg.booking_option_id)),
                "status": reg.status,
            }
        )

    return {"items": items, "total": total}


@router.post("/preview/{registration_id}")
async def preview_badge(
    conference_id: UUID,
    registration_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    badge_type: str = "attendee",
) -> StreamingResponse:
    """Generate a badge preview PDF for a registration (inline display)."""
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(Conference)
        .options(joinedload(Conference.tenant))
        .where(Conference.id == conference_id, Conference.tenant_id == current_user.tenant_id)
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    from app.core.badge_pdf import generate_badge_pdf

    pdf_bytes = await generate_badge_pdf(registration_id, conference, badge_type, db)

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline; filename=badge_preview.pdf"},
    )


@router.post("/generate/{registration_id}")
async def generate_badge(
    conference_id: UUID,
    registration_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
    badge_type: str = "attendee",
) -> StreamingResponse:
    """Generate and download a badge PDF for a single registration."""
    await check_conference_admin(conference_id, current_user, db)

    result = await db.execute(
        select(Conference)
        .options(joinedload(Conference.tenant))
        .where(Conference.id == conference_id, Conference.tenant_id == current_user.tenant_id)
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    from app.core.badge_pdf import generate_badge_pdf

    pdf_bytes = await generate_badge_pdf(registration_id, conference, badge_type, db)

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=badge.pdf"},
    )


@router.post("/generate-bulk")
async def generate_badges_bulk_endpoint(
    conference_id: UUID,
    body: BadgeBulkRequest,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> StreamingResponse:
    """Generate a multi-page badge PDF for multiple registrations."""
    await check_conference_admin(conference_id, current_user, db)

    if not body.registration_ids:
        raise ValidationError("No registration IDs provided")

    result = await db.execute(
        select(Conference)
        .options(joinedload(Conference.tenant))
        .where(Conference.id == conference_id, Conference.tenant_id == current_user.tenant_id)
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    from app.core.badge_pdf import generate_badges_bulk

    reg_ids = [UUID(rid) for rid in body.registration_ids]
    pdf_bytes = await generate_badges_bulk(reg_ids, conference, body.badge_type, db)

    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=badges_bulk.pdf"},
    )
