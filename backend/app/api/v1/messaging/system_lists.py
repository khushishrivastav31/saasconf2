"""System recipient lists — computed groups from user roles, sponsors, registrations."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select

from app.core.conference_helpers import get_conference_for_tenant
from app.core.dependencies import CurrentUserDep, DbSessionDep, require_module
from app.models.registration import Registration
from app.models.settings import SponsorPackage, UserRole, UserRoleAssignment
from app.models.sponsor import Sponsor
from app.schemas.messaging import (
    RecipientPreviewItem,
    RecipientPreviewResponse,
    SystemRecipientGroup,
)

from ._shared import (
    MODULE_CODE,
    recipients_to_preview,
    resolve_registrations,
    resolve_sponsors,
)

router = APIRouter(prefix="/system-lists")


@router.get(
    "",
    response_model=list[SystemRecipientGroup],
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def list_system_groups(
    conference_id: UUID,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> list[SystemRecipientGroup]:
    """List available system recipient groups for this conference."""
    tenant_id = current_user.tenant_id
    await get_conference_for_tenant(db, conference_id, tenant_id)

    groups: list[SystemRecipientGroup] = []

    # --- User roles with assignment counts ---
    role_counts = await db.execute(
        select(
            UserRole.id,
            UserRole.name,
            func.count(UserRoleAssignment.id).label("cnt"),
        )
        .outerjoin(UserRoleAssignment, UserRoleAssignment.user_role_id == UserRole.id)
        .where(
            UserRole.tenant_id == tenant_id,
            UserRole.conference_id == conference_id,
            UserRole.is_active.is_(True),
        )
        .group_by(UserRole.id, UserRole.name)
        .order_by(UserRole.name)
    )
    for row in role_counts.all():
        if row.cnt > 0:
            groups.append(
                SystemRecipientGroup(
                    key=f"user_role:{row.id}",
                    label=f"{row.name} ({row.cnt})",
                    category="user_role",
                    count=row.cnt,
                )
            )

    # --- Registrations ---
    reg_count_result = await db.execute(
        select(func.count()).where(
            Registration.tenant_id == tenant_id,
            Registration.conference_id == conference_id,
            Registration.status != "cancelled",
        )
    )
    reg_count = reg_count_result.scalar() or 0
    if reg_count > 0:
        groups.append(
            SystemRecipientGroup(
                key="all_registrations",
                label=f"All Registrations ({reg_count})",
                category="registration",
                count=reg_count,
            )
        )

    # --- Sponsors ---
    sponsor_count_result = await db.execute(
        select(func.count()).where(
            Sponsor.tenant_id == tenant_id,
            Sponsor.conference_id == conference_id,
            Sponsor.is_active.is_(True),
        )
    )
    sponsor_count = sponsor_count_result.scalar() or 0
    if sponsor_count > 0:
        groups.append(
            SystemRecipientGroup(
                key="all_sponsors",
                label=f"All Sponsors ({sponsor_count})",
                category="sponsor",
                count=sponsor_count,
            )
        )

    # Sponsor packages with sponsor counts
    pkg_counts = await db.execute(
        select(
            SponsorPackage.id,
            SponsorPackage.name,
            func.count(Sponsor.id).label("cnt"),
        )
        .outerjoin(Sponsor, (Sponsor.sponsor_package_id == SponsorPackage.id) & Sponsor.is_active.is_(True))
        .where(
            SponsorPackage.tenant_id == tenant_id,
            SponsorPackage.conference_id == conference_id,
        )
        .group_by(SponsorPackage.id, SponsorPackage.name)
        .order_by(SponsorPackage.name)
    )
    for row in pkg_counts.all():
        if row.cnt > 0:
            groups.append(
                SystemRecipientGroup(
                    key=f"sponsor_package:{row.id}",
                    label=f"{row.name} ({row.cnt})",
                    category="sponsor",
                    count=row.cnt,
                )
            )

    return groups


@router.get(
    "/{group_key}/preview",
    response_model=RecipientPreviewResponse,
    dependencies=[Depends(require_module(MODULE_CODE))],
)
async def preview_system_group(
    conference_id: UUID,
    group_key: str,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> RecipientPreviewResponse:
    """Preview recipients for a system group."""
    tenant_id = current_user.tenant_id
    await get_conference_for_tenant(db, conference_id, tenant_id)

    items: list[RecipientPreviewItem] = []

    if group_key.startswith("user_role:"):
        role_id = UUID(group_key.split(":", 1)[1])
        from app.models.cfp import CFPApplicant

        result = await db.execute(
            select(CFPApplicant)
            .join(UserRoleAssignment, UserRoleAssignment.applicant_id == CFPApplicant.id)
            .where(
                UserRoleAssignment.user_role_id == role_id,
                UserRoleAssignment.tenant_id == tenant_id,
            )
            .limit(50)
        )
        for a in result.scalars().all():
            items.append(
                RecipientPreviewItem(
                    email=a.email,
                    first_name=a.first_name,
                    last_name=a.last_name,
                    source="applicant",
                )
            )
        # Get total count
        count_result = await db.execute(
            select(func.count()).where(
                UserRoleAssignment.user_role_id == role_id,
                UserRoleAssignment.tenant_id == tenant_id,
            )
        )
        total = count_result.scalar() or 0

    elif group_key == "all_registrations":
        recipients = await resolve_registrations(db, tenant_id, conference_id)
        total = len(recipients)
        items = recipients_to_preview(recipients)

    elif group_key == "all_sponsors":
        recipients = await resolve_sponsors(db, tenant_id, conference_id)
        total = len(recipients)
        items = recipients_to_preview(recipients)

    elif group_key.startswith("sponsor_package:"):
        pkg_id = UUID(group_key.split(":", 1)[1])
        recipients = await resolve_sponsors(db, tenant_id, conference_id, filters={"sponsor_package_ids": [pkg_id]})
        total = len(recipients)
        items = recipients_to_preview(recipients)

    else:
        total = 0

    return RecipientPreviewResponse(total=total, items=items)
