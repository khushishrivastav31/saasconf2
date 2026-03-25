"""Conference duplication service.

Copies all structural/configuration data from a source conference to a new one.
Instance data (registrations, invoices, papers, sponsors, etc.) is never copied.
"""

import copy
import uuid
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.alumni import Alumni
from app.models.attachment import Attachment
from app.models.booking import (
    BookingOption,
    BookingPackage,
    BookingPackageOption,
    BookingPeriod,
    DiscountCode,
    DiscountCodeOption,
    DiscountCodePeriod,
)
from app.models.budget import BudgetCategory
from app.models.conference import Conference
from app.models.form_schema import ConferencePaperFormSchema, PaperFormField
from app.models.review import (
    ReviewCriterion,
    ReviewFormSettings,
    ReviewQuestion,
    ReviewScaleOption,
    ReviewScoreScale,
)
from app.models.screen_overlay import ScreenOverlay
from app.models.settings import (
    CFPCommitteeRole,
    ConferenceCurrency,
    EmailTemplate,
    SessionType,
    SponsorPackage,
    TenantLocationType,
    VolunteerRole,
)
from app.schemas.conference import DuplicateConferenceRequest


async def duplicate_conference(
    db: AsyncSession,
    source_id: UUID,
    tenant_id: UUID,
    request: DuplicateConferenceRequest,
) -> Conference:
    """Duplicate a conference with all its structural configuration data.

    Args:
        db: Database session (caller must commit).
        source_id: ID of the conference to duplicate.
        tenant_id: Tenant owning the conference.
        request: New name, abbreviation, and optional start_date.

    Returns:
        The newly created Conference (flushed, not committed).
    """
    # ── 1. Fetch source conference ────────────────────────────────────────
    result = await db.execute(select(Conference).where(Conference.id == source_id, Conference.tenant_id == tenant_id))
    source = result.scalar_one()

    # ── 2. Create new conference ──────────────────────────────────────────
    new_conf = Conference(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        name=request.name,
        abbreviation=request.abbreviation,
        description=source.description,
        website=source.website,
        logo_url=source.logo_url,
        support_email=source.support_email,
        contact_email=source.contact_email,
        phone=source.phone,
        start_date=request.start_date,
        end_date=None,  # New edition — dates TBD
        venue_name=source.venue_name,
        venue_address=source.venue_address,
        city=source.city,
        state=source.state,
        postal_code=source.postal_code,
        country=source.country,
        timezone=source.timezone,
        locale=source.locale,
        venue_type=source.venue_type,
        venue_url=source.venue_url,
        virtual_platform_url=source.virtual_platform_url,
        social_links=copy.deepcopy(source.social_links) if source.social_links else {},
        team_members=copy.deepcopy(source.team_members) if source.team_members else [],
        settings=copy.deepcopy(source.settings) if source.settings else {},
        currency=source.currency,
        invoice_currency=source.invoice_currency,
        is_active=False,
        is_published=False,
    )
    db.add(new_conf)
    await db.flush()
    new_id = new_conf.id

    # ── 3. Copy simple config tables (no parent-child FKs) ───────────────
    # Note: PronounOption is tenant-scoped (not conference-scoped) so no copying needed
    await _copy_simple_rows(db, VolunteerRole, source_id, new_id, tenant_id, ["name", "description", "is_active"])
    await _copy_simple_rows(db, CFPCommitteeRole, source_id, new_id, tenant_id, ["name", "description", "is_active"])
    await _copy_simple_rows(
        db, TenantLocationType, source_id, new_id, tenant_id, ["name", "slug", "description", "is_active"]
    )
    await _copy_simple_rows(
        db, ConferenceCurrency, source_id, new_id, tenant_id, ["code", "name", "symbol", "is_active"]
    )
    await _copy_simple_rows(db, BudgetCategory, source_id, new_id, tenant_id, ["name", "color", "sort_order"])
    await _copy_simple_rows(
        db,
        SessionType,
        source_id,
        new_id,
        tenant_id,
        ["name", "slug", "duration_minutes", "cfp_eligible", "separately_bookable", "max_attendees", "is_active"],
    )

    # ── 4. Sponsor packages + contract template attachments ───────────────
    await _copy_sponsor_packages(db, source_id, new_id, tenant_id)

    # ── 5. Booking matrix (periods → options → packages → package-options) ─
    period_map, option_map = await _copy_booking_matrix(db, source, new_conf, tenant_id)

    # ── 6. Discount codes ─────────────────────────────────────────────────
    await _copy_discount_codes(db, source_id, new_id, tenant_id, period_map, option_map)

    # ── 7. Review system (scales → criteria → questions) ──────────────────
    await _copy_review_system(db, source_id, new_id, tenant_id)

    # ── 8. Email templates ────────────────────────────────────────────────
    overlay_map = await _copy_screen_overlays(db, source_id, new_id, tenant_id)
    await _copy_email_templates(db, source_id, new_id, tenant_id, overlay_map)

    # ── 9. Paper form schema + custom fields ──────────────────────────────
    await _copy_paper_form(db, source_id, new_id, tenant_id)

    # ── 10. Alumni ────────────────────────────────────────────────────────
    await _copy_alumni(db, source_id, new_id, tenant_id)

    # ── 11. Review form settings ──────────────────────────────────────────
    await _copy_review_form_settings(db, source_id, new_id, tenant_id)

    await db.flush()
    return new_conf


# ═══════════════════════════════════════════════════════════════════════════
# Helper functions
# ═══════════════════════════════════════════════════════════════════════════


async def _copy_simple_rows(
    db: AsyncSession,
    model: Any,
    source_id: UUID,
    new_id: UUID,
    tenant_id: UUID,
    fields: list[str],
) -> None:
    """Copy rows from a conference-scoped model, creating new UUIDs."""
    result = await db.execute(select(model).where(model.conference_id == source_id, model.tenant_id == tenant_id))
    for row in result.scalars().all():
        kwargs: dict[str, Any] = {"id": uuid.uuid4(), "tenant_id": tenant_id, "conference_id": new_id}
        for f in fields:
            kwargs[f] = getattr(row, f)
        db.add(model(**kwargs))
    await db.flush()


async def _copy_sponsor_packages(db: AsyncSession, source_id: UUID, new_id: UUID, tenant_id: UUID) -> dict[UUID, UUID]:
    """Copy sponsor packages and their contract template attachments. Returns old→new ID map."""
    pkg_map: dict[UUID, UUID] = {}
    result = await db.execute(
        select(SponsorPackage).where(SponsorPackage.conference_id == source_id, SponsorPackage.tenant_id == tenant_id)
    )
    for pkg in result.scalars().all():
        new_pkg_id = uuid.uuid4()
        pkg_map[pkg.id] = new_pkg_id
        db.add(
            SponsorPackage(
                id=new_pkg_id,
                tenant_id=tenant_id,
                conference_id=new_id,
                name=pkg.name,
                description=pkg.description,
                price=pkg.price,
                currency=pkg.currency,
                is_active=pkg.is_active,
            )
        )
    await db.flush()

    # Copy contract template attachments
    if pkg_map:
        old_ids = list(pkg_map.keys())
        att_result = await db.execute(
            select(Attachment).where(
                Attachment.tenant_id == tenant_id,
                Attachment.entity_type == "sponsor_package_contract",
                Attachment.entity_id.in_(old_ids),
            )
        )
        for att in att_result.scalars().all():
            new_entity_id = pkg_map.get(att.entity_id)
            if new_entity_id:
                db.add(
                    Attachment(
                        id=uuid.uuid4(),
                        tenant_id=tenant_id,
                        entity_type="sponsor_package_contract",
                        entity_id=new_entity_id,
                        filename=att.filename,
                        content_type=att.content_type,
                        file_size=att.file_size,
                        file_data=att.file_data,
                        description=att.description,
                    )
                )
        await db.flush()

    return pkg_map


async def _copy_booking_matrix(
    db: AsyncSession,
    source: Conference,
    new_conf: Conference,
    tenant_id: UUID,
) -> tuple[dict[UUID, UUID], dict[UUID, UUID]]:
    """Copy booking periods, options, packages, and package-options. Returns (period_map, option_map)."""
    source_id = source.id
    new_id = new_conf.id
    period_map: dict[UUID, UUID] = {}
    option_map: dict[UUID, UUID] = {}
    package_map: dict[UUID, UUID] = {}

    # Periods
    periods_result = await db.execute(
        select(BookingPeriod).where(BookingPeriod.conference_id == source_id, BookingPeriod.tenant_id == tenant_id)
    )
    source_periods = periods_result.scalars().all()
    for p in source_periods:
        new_period_id = uuid.uuid4()
        period_map[p.id] = new_period_id

        # Recalculate dates if both source and target have start_date
        start_date = p.start_date
        end_date = p.end_date
        if source.start_date and new_conf.start_date:
            start_offset = p.start_date - source.start_date
            end_offset = p.end_date - source.start_date
            start_date = new_conf.start_date + start_offset
            end_date = new_conf.start_date + end_offset

        db.add(
            BookingPeriod(
                id=new_period_id,
                tenant_id=tenant_id,
                conference_id=new_id,
                name=p.name,
                start_date=start_date,
                end_date=end_date,
                sort_order=p.sort_order,
                prices=None,  # Will be set after options are created
                currency=p.currency,
                is_active=p.is_active,
            )
        )
    await db.flush()

    # Options
    options_result = await db.execute(
        select(BookingOption).where(BookingOption.conference_id == source_id, BookingOption.tenant_id == tenant_id)
    )
    for o in options_result.scalars().all():
        new_option_id = uuid.uuid4()
        option_map[o.id] = new_option_id
        db.add(
            BookingOption(
                id=new_option_id,
                tenant_id=tenant_id,
                conference_id=new_id,
                name=o.name,
                description=o.description,
                conference_day_id=None,  # Program days are not copied
                sort_order=o.sort_order,
                is_active=o.is_active,
                attendance_type=o.attendance_type,
            )
        )
    await db.flush()

    # Now remap period.prices JSONB (keys are old option UUID strings → new option UUIDs)
    for old_period in source_periods:
        if old_period.prices:
            new_period_id = period_map[old_period.id]
            remapped_prices: dict[str, object] = {}
            for old_key, value in old_period.prices.items():
                try:
                    old_option_uuid = UUID(old_key)
                    new_option_uuid = option_map.get(old_option_uuid)
                    if new_option_uuid:
                        remapped_prices[str(new_option_uuid)] = value
                except ValueError:
                    remapped_prices[old_key] = value
            # Update the new period's prices
            new_period_result = await db.execute(select(BookingPeriod).where(BookingPeriod.id == new_period_id))
            new_period = new_period_result.scalar_one()
            new_period.prices = remapped_prices
    await db.flush()

    # Packages
    packages_result = await db.execute(
        select(BookingPackage).where(BookingPackage.conference_id == source_id, BookingPackage.tenant_id == tenant_id)
    )
    for pkg in packages_result.scalars().all():
        new_pkg_id = uuid.uuid4()
        package_map[pkg.id] = new_pkg_id
        db.add(
            BookingPackage(
                id=new_pkg_id,
                tenant_id=tenant_id,
                conference_id=new_id,
                name=pkg.name,
                description=pkg.description,
                sort_order=pkg.sort_order,
                is_active=pkg.is_active,
            )
        )
    await db.flush()

    # Package-Options junction (filter by source package IDs)
    if package_map:
        old_pkg_ids = list(package_map.keys())
        po_result = await db.execute(
            select(BookingPackageOption).where(BookingPackageOption.booking_package_id.in_(old_pkg_ids))
        )
        for po in po_result.scalars().all():
            new_pkg = package_map.get(po.booking_package_id)
            new_opt = option_map.get(po.booking_option_id)
            if new_pkg and new_opt:
                db.add(
                    BookingPackageOption(
                        id=uuid.uuid4(),
                        tenant_id=tenant_id,
                        booking_package_id=new_pkg,
                        booking_option_id=new_opt,
                    )
                )
        await db.flush()

    return period_map, option_map


async def _copy_discount_codes(
    db: AsyncSession,
    source_id: UUID,
    new_id: UUID,
    tenant_id: UUID,
    period_map: dict[UUID, UUID],
    option_map: dict[UUID, UUID],
) -> None:
    """Copy discount codes and their period/option associations."""
    code_map: dict[UUID, UUID] = {}
    dc_result = await db.execute(
        select(DiscountCode).where(DiscountCode.conference_id == source_id, DiscountCode.tenant_id == tenant_id)
    )
    for dc in dc_result.scalars().all():
        new_dc_id = uuid.uuid4()
        code_map[dc.id] = new_dc_id
        db.add(
            DiscountCode(
                id=new_dc_id,
                tenant_id=tenant_id,
                conference_id=new_id,
                description=dc.description,
                code=dc.code,
                discount_type=dc.discount_type,
                discount_value=dc.discount_value,
                currency=dc.currency,
                start_date=None,  # Dates cleared for new edition
                end_date=None,
                max_uses=dc.max_uses,
                usage_count=0,  # Reset usage
                is_active=dc.is_active,
                is_combinable=dc.is_combinable,
            )
        )
    await db.flush()

    if not code_map:
        return

    old_dc_ids = list(code_map.keys())

    # Discount-Period associations
    dp_result = await db.execute(select(DiscountCodePeriod).where(DiscountCodePeriod.discount_code_id.in_(old_dc_ids)))
    for dp in dp_result.scalars().all():
        new_dc = code_map.get(dp.discount_code_id)
        new_period = period_map.get(dp.booking_period_id)
        if new_dc and new_period:
            db.add(
                DiscountCodePeriod(
                    id=uuid.uuid4(),
                    tenant_id=tenant_id,
                    discount_code_id=new_dc,
                    booking_period_id=new_period,
                )
            )

    # Discount-Option associations
    do_result = await db.execute(select(DiscountCodeOption).where(DiscountCodeOption.discount_code_id.in_(old_dc_ids)))
    for do in do_result.scalars().all():
        new_dc = code_map.get(do.discount_code_id)
        new_opt = option_map.get(do.booking_option_id)
        if new_dc and new_opt:
            db.add(
                DiscountCodeOption(
                    id=uuid.uuid4(),
                    tenant_id=tenant_id,
                    discount_code_id=new_dc,
                    booking_option_id=new_opt,
                )
            )
    await db.flush()


async def _copy_review_system(db: AsyncSession, source_id: UUID, new_id: UUID, tenant_id: UUID) -> None:
    """Copy review score scales (with options), criteria, and questions."""
    scale_map: dict[UUID, UUID] = {}

    # Score scales + options (loaded via selectin)
    scales_result = await db.execute(
        select(ReviewScoreScale)
        .options(selectinload(ReviewScoreScale.options))
        .where(ReviewScoreScale.conference_id == source_id, ReviewScoreScale.tenant_id == tenant_id)
    )
    for scale in scales_result.scalars().all():
        new_sid = uuid.uuid4()
        scale_map[scale.id] = new_sid
        db.add(
            ReviewScoreScale(
                id=new_sid,
                tenant_id=tenant_id,
                conference_id=new_id,
                name=scale.name,
                scale_type=scale.scale_type,
                is_active=scale.is_active,
            )
        )
        await db.flush()

        for opt in scale.options:
            db.add(
                ReviewScaleOption(
                    id=uuid.uuid4(),
                    scale_id=new_sid,
                    label=opt.label,
                    numeric_value=opt.numeric_value,
                    is_unsure=opt.is_unsure,
                    display_order=opt.display_order,
                )
            )
    await db.flush()

    # Criteria + questions
    criteria_result = await db.execute(
        select(ReviewCriterion)
        .options(selectinload(ReviewCriterion.questions))
        .where(ReviewCriterion.conference_id == source_id, ReviewCriterion.tenant_id == tenant_id)
    )
    for crit in criteria_result.scalars().all():
        new_crit_id = uuid.uuid4()
        db.add(
            ReviewCriterion(
                id=new_crit_id,
                tenant_id=tenant_id,
                conference_id=new_id,
                title=crit.title,
                description=crit.description,
                display_order=crit.display_order,
                is_active=crit.is_active,
            )
        )
        await db.flush()

        for q in crit.questions:
            mapped_scale_id = scale_map.get(q.score_scale_id) if q.score_scale_id else None
            db.add(
                ReviewQuestion(
                    id=uuid.uuid4(),
                    criterion_id=new_crit_id,
                    tenant_id=tenant_id,
                    conference_id=new_id,
                    text=q.text,
                    help_text=q.help_text,
                    question_type=q.question_type,
                    score_scale_id=mapped_scale_id,
                    weight=q.weight,
                    comment_requirement=q.comment_requirement,
                    low_score_threshold=q.low_score_threshold,
                    show_to_reviewers=q.show_to_reviewers,
                    count_in_score=q.count_in_score,
                    display_order=q.display_order,
                    is_active=q.is_active,
                )
            )
    await db.flush()


async def _copy_screen_overlays(db: AsyncSession, source_id: UUID, new_id: UUID, tenant_id: UUID) -> dict[UUID, UUID]:
    """Copy screen overlays. Returns old→new ID map (used for email template FK)."""
    overlay_map: dict[UUID, UUID] = {}
    result = await db.execute(
        select(ScreenOverlay).where(ScreenOverlay.conference_id == source_id, ScreenOverlay.tenant_id == tenant_id)
    )
    for ov in result.scalars().all():
        new_ov_id = uuid.uuid4()
        overlay_map[ov.id] = new_ov_id
        db.add(
            ScreenOverlay(
                id=new_ov_id,
                tenant_id=tenant_id,
                conference_id=new_id,
                trigger_type=ov.trigger_type,
                title=ov.title,
                body_text=ov.body_text,
                animation_style=ov.animation_style,
                duration_seconds=ov.duration_seconds,
                is_active=ov.is_active,
                schedule_date=None,  # Cleared for new edition
                display_order=ov.display_order,
                image_url=ov.image_url,
            )
        )
    await db.flush()
    return overlay_map


async def _copy_email_templates(
    db: AsyncSession,
    source_id: UUID,
    new_id: UUID,
    tenant_id: UUID,
    overlay_map: dict[UUID, UUID],
) -> None:
    """Copy email templates with remapped screen_overlay_id."""
    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.conference_id == source_id,
            EmailTemplate.tenant_id == tenant_id,
        )
    )
    for et in result.scalars().all():
        new_overlay_id = overlay_map.get(et.screen_overlay_id) if et.screen_overlay_id else None
        db.add(
            EmailTemplate(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                conference_id=new_id,
                template_type=et.template_type,
                subject=et.subject,
                body_html=et.body_html,
                body_text=et.body_text,
                is_active=et.is_active,
                screen_overlay_id=new_overlay_id,
            )
        )
    await db.flush()


async def _copy_paper_form(db: AsyncSession, source_id: UUID, new_id: UUID, tenant_id: UUID) -> None:
    """Copy paper form schema and its custom fields."""
    result = await db.execute(
        select(ConferencePaperFormSchema)
        .options(selectinload(ConferencePaperFormSchema.fields))
        .where(ConferencePaperFormSchema.conference_id == source_id)
    )
    schema = result.scalar_one_or_none()
    if not schema:
        return

    new_schema_id = uuid.uuid4()
    db.add(
        ConferencePaperFormSchema(
            id=new_schema_id,
            tenant_id=tenant_id,
            conference_id=new_id,
            version=1,
            builtin_fields_config=copy.deepcopy(schema.builtin_fields_config),
        )
    )
    await db.flush()

    for field in schema.fields:
        db.add(
            PaperFormField(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                schema_id=new_schema_id,
                field_key=field.field_key,
                field_type=field.field_type,
                label=field.label,
                description=field.description,
                placeholder=field.placeholder,
                help_text=field.help_text,
                display_order=field.display_order,
                is_visible=field.is_visible,
                is_required=field.is_required,
                validation_rules=copy.deepcopy(field.validation_rules) if field.validation_rules else None,
                options=copy.deepcopy(field.options) if field.options else None,
            )
        )
    await db.flush()


async def _copy_alumni(db: AsyncSession, source_id: UUID, new_id: UUID, tenant_id: UUID) -> None:
    """Copy alumni records to the new conference."""
    result = await db.execute(select(Alumni).where(Alumni.conference_id == source_id, Alumni.tenant_id == tenant_id))
    for a in result.scalars().all():
        db.add(
            Alumni(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                conference_id=new_id,
                email=a.email,
                first_name=a.first_name,
                last_name=a.last_name,
                company=a.company,
                source=a.source,
                notes=a.notes,
            )
        )
    await db.flush()


async def _copy_review_form_settings(db: AsyncSession, source_id: UUID, new_id: UUID, tenant_id: UUID) -> None:
    """Copy review form settings (comment field toggles)."""
    result = await db.execute(
        select(ReviewFormSettings).where(
            ReviewFormSettings.conference_id == source_id, ReviewFormSettings.tenant_id == tenant_id
        )
    )
    settings = result.scalar_one_or_none()
    if settings:
        db.add(
            ReviewFormSettings(
                id=uuid.uuid4(),
                tenant_id=tenant_id,
                conference_id=new_id,
                enable_speaker_feedback=settings.enable_speaker_feedback,
                enable_internal_comment=settings.enable_internal_comment,
                enable_must_have=settings.enable_must_have,
            )
        )
        await db.flush()
