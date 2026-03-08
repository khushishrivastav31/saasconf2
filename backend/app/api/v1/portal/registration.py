"""
Public Registration API

Public endpoint for conference registration (no authentication required).
Implements comprehensive security measures for public-facing forms.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import DbSessionDep
from app.core.exceptions import ValidationError
from app.core.invoice_auto_generation import create_invoice_for_registrations
from app.core.recaptcha import validate_recaptcha
from app.core.registration_emails import (
    send_attendee_welcome_email,
    send_registration_invoice_email,
)
from app.core.registration_security import validate_registration_security
from app.core.stripe_helper import create_payment_intent
from app.core.user_auto_creation import create_user_for_registration
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.registration import (
    BillingProfile,
    Registration,
    RegistrationMode,
    RegistrationStatus,
)
from app.models.tenant import Tenant
from app.schemas.portal_registration import (
    PortalRegistrationRequest,
    PortalRegistrationResponse,
    PublicBookingOption,
    PublicConference,
)
from app.schemas.registration import RegistrationResponse

from ..registrations._helpers import (
    _build_response,
    _check_email_unique,
    _create_items,
    _validate_booking_option,
)

logger = logging.getLogger(__name__)
router = APIRouter()


async def resolve_tenant_and_conference(
    db: AsyncSession,
    tenant_slug: str,
    conference_slug: str,
) -> tuple[Tenant, Conference]:
    """
    Resolve tenant and conference from slugs.

    Args:
        db: Database session
        tenant_slug: Tenant's URL slug
        conference_slug: Conference's abbreviation/slug

    Returns:
        Tuple of (tenant, conference)

    Raises:
        HTTPException: If tenant or conference not found
    """
    # Find tenant
    result = await db.execute(select(Tenant).where(Tenant.slug == tenant_slug))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_slug}' not found")

    # Find conference
    result = await db.execute(
        select(Conference).where(
            Conference.tenant_id == tenant.id,
            Conference.abbreviation == conference_slug,
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise HTTPException(
            status_code=404,
            detail=f"Conference '{conference_slug}' not found",
        )

    # Check if public registration is enabled
    portal_settings = conference.settings.get("public_registration_portal", {})
    if not portal_settings.get("enabled"):
        raise HTTPException(
            status_code=403,
            detail="Public registration is not enabled for this conference",
        )

    return tenant, conference


@router.get("/{tenant_slug}/conferences/{conference_slug}")
async def get_public_conference(
    tenant_slug: str,
    conference_slug: str,
    db: DbSessionDep,
) -> PublicConference:
    """
    Get public conference details for registration portal.

    No authentication required - publicly accessible endpoint.
    """
    from datetime import date

    from app.models.booking import BookingPeriod

    tenant, conference = await resolve_tenant_and_conference(db, tenant_slug, conference_slug)

    # Fetch active booking periods to get current prices
    today = date.today()
    periods_result = await db.execute(
        select(BookingPeriod)
        .where(
            BookingPeriod.conference_id == conference.id,
            BookingPeriod.is_active == True,  # noqa: E712
            BookingPeriod.start_date <= today,
            BookingPeriod.end_date >= today,
        )
        .order_by(BookingPeriod.sort_order)
    )
    active_periods = periods_result.scalars().all()

    # Use the first active period for pricing (or None if no active period)
    current_period = active_periods[0] if active_periods else None

    # Fetch booking options with availability
    result = await db.execute(
        select(BookingOption)
        .where(
            BookingOption.conference_id == conference.id,
            BookingOption.is_active == True,  # noqa: E712
        )
        .order_by(BookingOption.sort_order)
    )
    booking_options_db = result.scalars().all()

    # Build public booking options with availability
    booking_options = []
    for option in booking_options_db:
        # Get price from current period
        price = 0.0
        if current_period and current_period.prices:
            option_price = current_period.prices.get(str(option.id))
            if option_price is not None:
                price = float(option_price)

        # Skip options with no price (not available in current period)
        if price <= 0:
            continue

        # Count current registrations
        registrations_result = await db.execute(
            select(Registration).where(
                Registration.booking_option_id == option.id,
                Registration.status.in_([RegistrationStatus.CONFIRMED, RegistrationStatus.PENDING]),
            )
        )
        current_count = len(registrations_result.scalars().all())

        # Check if sold out
        is_sold_out = False
        if option.capacity is not None:
            is_sold_out = current_count >= option.capacity

        booking_options.append(
            PublicBookingOption(
                id=option.id,
                name=option.name,
                description=option.description,
                price=price,
                capacity=option.capacity,
                current_registrations=current_count,
                is_sold_out=is_sold_out,
                conference_day_id=option.conference_day_id,
            )
        )

    # Build location string
    location = conference.venue_name or conference.city or None

    return PublicConference(
        id=conference.id,
        name=conference.name,
        abbreviation=conference.abbreviation or "",
        description=conference.description,
        start_date=conference.start_date.isoformat() if conference.start_date else None,
        end_date=conference.end_date.isoformat() if conference.end_date else None,
        location=location,
        website=conference.website,
        booking_options=booking_options,
        currency=conference.currency or "EUR",
    )


@router.post("/{tenant_slug}/conferences/{conference_slug}/register")
async def create_public_registration(
    request: Request,
    tenant_slug: str,
    conference_slug: str,
    data: PortalRegistrationRequest,
    db: DbSessionDep,
) -> PortalRegistrationResponse:
    """
    Create public conference registration (no authentication required).

    Security measures:
    - reCAPTCHA v3 validation (score ≥ 0.5)
    - Honeypot field check
    - Form timestamp validation
    - Disposable email blocking
    - Rate limiting (3 registrations per hour per IP)

    Flow:
    1. Validate security checks
    2. Create billing profile + registrations
    3. Generate invoice
    4. Create PaymentIntent (if credit card)
    5. Create user accounts with password setup tokens
    6. Send emails (invoice + welcome)

    Args:
        request: FastAPI request
        tenant_slug: Tenant URL slug
        conference_slug: Conference abbreviation
        data: Registration request data
        db: Database session

    Returns:
        PortalRegistrationResponse with payment details

    Raises:
        HTTPException: If validation fails or errors occur
    """
    # Resolve tenant and conference (public-safe)
    tenant, conference = await resolve_tenant_and_conference(db, tenant_slug, conference_slug)
    tenant_id = tenant.id
    conference_id = conference.id

    # Set RLS context for multi-tenant isolation
    await db.execute(text(f"SET app.current_tenant_id = '{tenant_id}'"))

    # Security validations
    recaptcha_settings = conference.settings.get("recaptcha", {})
    if recaptcha_settings.get("enabled"):
        secret_key = recaptcha_settings.get("secret_key", "")
        threshold = recaptcha_settings.get("score_threshold", 0.5)
        await validate_recaptcha(data.recaptcha_token, secret_key, threshold)

    await validate_registration_security(
        request=request,
        billing_email=data.billing.contact_email,
        honeypot_field=data.honeypot_field,
        form_start_timestamp=data.form_start_timestamp,
    )

    # Validate all emails are unique for this conference
    for att in data.attendees:
        await _check_email_unique(db, conference_id, att.email)

    # Validate all referenced booking options
    option_ids = {att.booking_option_id for att in data.attendees}
    opt_map: dict[UUID, BookingOption] = {}
    for oid in option_ids:
        opt_map[oid] = await _validate_booking_option(db, oid, conference_id, tenant_id)

    # Create shared billing profile
    billing = BillingProfile(
        tenant_id=tenant_id,
        conference_id=conference_id,
        **data.billing.model_dump(exclude={"payment_method"}),
        payment_method=data.billing.payment_method or "credit_card",
    )
    db.add(billing)
    await db.flush()

    # Create registrations
    registrations: list[Registration] = []
    responses: list[RegistrationResponse] = []

    for att in data.attendees:
        reg = Registration(
            tenant_id=tenant_id,
            conference_id=conference_id,
            billing_profile_id=billing.id,
            first_name=att.first_name,
            last_name=att.last_name,
            email=att.email.lower(),
            pronouns=att.pronouns,
            job_title=att.job_title,
            department=att.department,
            phone=att.phone,
            booking_option_id=att.booking_option_id,
            registration_mode=RegistrationMode.PORTAL.value,
            status=RegistrationStatus.REGISTERED_PENDING_INVOICE.value,
            notes=att.notes,
            # No created_by for public registrations
        )
        db.add(reg)
        await db.flush()

        # Create items (tutorials, add-ons)
        items = await _create_items(db, reg, att.items or [], conference_id, tenant_id, conference)
        if items:
            await db.flush()

        reg.billing_profile = billing
        registrations.append(reg)
        responses.append(
            _build_response(
                reg,
                option_name=opt_map[att.booking_option_id].name,
                items=items,
            )
        )

    # Auto-generate invoice
    try:
        invoice = await create_invoice_for_registrations(
            db=db,
            registrations=registrations,
            billing_profile=billing,
            conference=conference,
            tenant_id=tenant_id,
            current_user=None,  # Public registration (no user context)
        )
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Create Stripe PaymentIntent if credit card payment
    payment_client_secret: str | None = None
    stripe_publishable_key: str | None = None
    # Invoice was created with billing.payment_method as template_type
    payment_required = (billing.payment_method or "credit_card") == "credit_card"

    if payment_required and invoice:
        stripe_settings = conference.settings.get("stripe", {})
        if stripe_settings.get("is_enabled"):
            stripe_publishable_key = stripe_settings.get("publishable_key")
            try:
                payment_intent_id, client_secret = await create_payment_intent(
                    db=db,
                    conference=conference,
                    invoice=invoice,
                )
                payment_client_secret = client_secret
                logger.info(f"Created PaymentIntent {payment_intent_id} for invoice {invoice.id}")
            except ValidationError as e:
                logger.error(f"Failed to create PaymentIntent for invoice {invoice.id}: {e}")
                raise HTTPException(status_code=500, detail="Failed to initialize payment") from e

    await db.commit()

    # Post-commit operations (emails, user creation)
    # Create user accounts for each attendee
    for reg in registrations:
        try:
            _user, password_token = await create_user_for_registration(
                db=db,
                tenant_id=tenant_id,
                registration=reg,
            )
            # Send welcome email with password setup link
            await send_attendee_welcome_email(
                db=db,
                registration=reg,
                conference=conference,
                password_setup_token=password_token,
            )
        except Exception as e:
            logger.error(f"Failed to create user/send welcome email for {reg.email}: {e}")
            # Continue - don't block registration on email failures

    # Send invoice email to billing contact
    if invoice:
        try:
            await send_registration_invoice_email(
                db=db,
                invoice=invoice,
                conference=conference,
            )
        except Exception as e:
            logger.error(f"Failed to send invoice email for invoice {invoice.id}: {e}")

    # Build success URL
    success_url = f"/{tenant_slug}/register/{conference_slug}/success"

    return PortalRegistrationResponse(
        billing_profile_id=billing.id,
        registrations=responses,
        payment_required=payment_required,
        payment_client_secret=payment_client_secret,
        stripe_publishable_key=stripe_publishable_key,
        success_url=success_url,
    )
