"""Alumni discount validation logic for authenticated portal registrations."""

from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alumni import Alumni
from app.models.booking import DiscountCode
from app.models.conference import Conference


async def validate_alumni_discount(
    db: AsyncSession,
    tenant_id: UUID,
    conference_id: UUID,
    user_email: str,
) -> tuple[bool, DiscountCode | None, list[dict]]:
    """
    Check if user is alumni and validate ALUMNI discount code.

    Args:
        db: Database session
        tenant_id: Tenant UUID (for security check)
        conference_id: Conference UUID to check for
        user_email: User's email address

    Returns:
        Tuple of (is_alumni, discount_code_or_none, alumni_conferences_list)
        - is_alumni: True if user has attended any conference for this tenant
        - discount_code: Valid ALUMNI discount code if exists, None otherwise
        - alumni_conferences: List of {conference_id, conference_name} user attended
    """
    # Check if user is alumni for ANY conference in this tenant
    alumni_result = await db.execute(
        select(Alumni, Conference)
        .join(Conference, Alumni.conference_id == Conference.id)
        .where(
            Alumni.tenant_id == tenant_id,
            func.lower(Alumni.email) == user_email.lower(),
        )
        .order_by(Conference.start_date.desc())  # Most recent first
    )
    alumni_records = list(alumni_result.all())

    is_alumni = len(alumni_records) > 0

    # Build list of conferences user attended
    alumni_conferences = [
        {
            "conference_id": str(alumni.conference_id),
            "conference_name": conf.name,
            "conference_abbreviation": conf.abbreviation,
        }
        for alumni, conf in alumni_records
    ]

    if not is_alumni:
        return False, None, []

    # Check if ALUMNI discount code exists for THIS conference
    discount_result = await db.execute(
        select(DiscountCode).where(
            DiscountCode.conference_id == conference_id,
            DiscountCode.tenant_id == tenant_id,
            func.upper(DiscountCode.code) == "ALUMNI",
            DiscountCode.is_active == True,
        )
    )
    discount = discount_result.scalar_one_or_none()

    # Validate discount is currently usable
    if discount:
        today = date.today()

        # Check date range
        if discount.start_date and today < discount.start_date:
            return True, None, alumni_conferences  # Alumni but discount not started

        if discount.end_date and today > discount.end_date:
            return True, None, alumni_conferences  # Alumni but discount expired

        # Check usage limits
        if discount.max_uses > 0 and discount.usage_count >= discount.max_uses:
            return True, None, alumni_conferences  # Alumni but discount maxed out

    return True, discount, alumni_conferences


async def check_alumni_only(
    db: AsyncSession,
    tenant_id: UUID,
    user_email: str,
) -> bool:
    """
    Simple check if user is alumni for any conference in this tenant.

    Args:
        db: Database session
        tenant_id: Tenant UUID
        user_email: User's email address

    Returns:
        True if user has attended any conference for this tenant
    """
    result = await db.execute(
        select(Alumni).where(
            Alumni.tenant_id == tenant_id,
            func.lower(Alumni.email) == user_email.lower(),
        )
    )
    return result.scalar_one_or_none() is not None
