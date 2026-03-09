"""Authenticated portal registration endpoints for logged-in users."""

import logging
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.core.alumni_discount import validate_alumni_discount
from app.core.applicant_dependencies import CurrentApplicantDep, DbSessionDep
from app.core.exceptions import NotFoundError, ValidationError
from app.core.invoice_auto_generation import create_invoice_for_registrations
from app.core.registration_emails import send_attendee_welcome_email, send_registration_invoice_email
from app.core.stripe_helper import create_payment_intent
from app.core.user_auto_creation import create_user_for_registration
from app.models.booking import BookingOption
from app.models.conference import Conference
from app.models.registration import BillingProfile, Registration, RegistrationItem, RegistrationMode, RegistrationStatus
from app.schemas.portal_registration import PortalRegistrationRequest, PortalRegistrationResponse
from app.schemas.registration import RegistrationItemResponse, RegistrationResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/portal/conferences/{conference_id}/alumni-check")
async def check_alumni_status(
    conference_id: UUID,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> dict:
    """Check if current user is alumni and if ALUMNI discount exists.

    Returns:
        {
            "is_alumni": bool,
            "has_discount": bool,
            "discount_id": UUID | null,
            "alumni_conferences": list[dict],  # Conferences user attended
            "warning_message": str | null  # If alumni but no discount
        }
    """
    tenant_id = current_applicant.tenant_id
    user_email = current_applicant.email

    # Verify conference exists and belongs to tenant
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == tenant_id,
            Conference.is_active.is_(True),
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Check alumni status and discount
    is_alumni, discount, alumni_conferences = await validate_alumni_discount(
        db=db,
        tenant_id=tenant_id,
        conference_id=conference_id,
        user_email=user_email,
    )

    warning_message = None
    if is_alumni and not discount:
        conf_names = [c["conference_name"] for c in alumni_conferences]
        warning_message = (
            f"You are an alumnus from {', '.join(conf_names[:3])}"
            f"{' and others' if len(conf_names) > 3 else ''}, "
            "but the ALUMNI discount code is not currently available for this conference."
        )

    return {
        "is_alumni": is_alumni,
        "has_discount": discount is not None,
        "discount_id": str(discount.id) if discount else None,
        "alumni_conferences": alumni_conferences,
        "warning_message": warning_message,
    }


@router.post("/portal/conferences/{conference_id}/register")
async def create_authenticated_registration(
    conference_id: UUID,
    data: PortalRegistrationRequest,
    current_applicant: CurrentApplicantDep,
    db: DbSessionDep,
) -> PortalRegistrationResponse:
    """Create registration for authenticated user with alumni discount auto-application.

    Business Rules:
    - User must be logged in (CurrentApplicantDep)
    - If user is alumni, ALUMNI discount auto-applies (if exists and valid)
    - No other discount codes allowed
    - Pre-filled billing from user profile (frontend responsibility)
    - Same payment flow as public registration (Stripe Elements or bank transfer)
    """
    tenant_id = current_applicant.tenant_id
    user_email = current_applicant.email

    # Verify conference exists and is active
    result = await db.execute(
        select(Conference).where(
            Conference.id == conference_id,
            Conference.tenant_id == tenant_id,
            Conference.is_active.is_(True),
        )
    )
    conference = result.scalar_one_or_none()
    if not conference:
        raise NotFoundError("Conference not found")

    # Check alumni status and auto-apply discount
    is_alumni, alumni_discount, alumni_conferences = await validate_alumni_discount(
        db=db,
        tenant_id=tenant_id,
        conference_id=conference_id,
        user_email=user_email,
    )

    # Validate discount code in request
    discount_code_str = None
    if data.discount_code:
        # Only ALUMNI discount allowed for authenticated users
        if data.discount_code.upper() != "ALUMNI":
            raise ValidationError("Only ALUMNI discount code is allowed for authenticated registrations")

        # Verify user is actually alumni
        if not is_alumni:
            raise ValidationError("ALUMNI discount code is only for past attendees")

        # Verify discount exists
        if not alumni_discount:
            raise ValidationError("ALUMNI discount code is not currently available")

        discount_code_str = "ALUMNI"
    elif is_alumni and alumni_discount:
        # Auto-apply ALUMNI discount if user is alumni
        discount_code_str = "ALUMNI"
        logger.info(f"Auto-applying ALUMNI discount for user {user_email} at conference {conference_id}")

    # Validate all referenced booking options
    option_ids = {att.booking_option_id for att in data.attendees}
    opt_map: dict[UUID, BookingOption] = {}
    for oid in option_ids:
        result = await db.execute(
            select(BookingOption).where(
                BookingOption.id == oid,
                BookingOption.conference_id == conference_id,
                BookingOption.tenant_id == tenant_id,
                BookingOption.is_active.is_(True),
            )
        )
        opt = result.scalar_one_or_none()
        if not opt:
            raise ValidationError(f"Invalid booking option: {oid}")
        opt_map[oid] = opt

    # Create billing profile
    payment_intent_id = data.billing.payment_intent_id

    billing = BillingProfile(
        tenant_id=tenant_id,
        conference_id=conference_id,
        **data.billing.model_dump(exclude={"payment_method", "payment_intent_id"}),
        payment_method=data.billing.payment_method or "credit_card",
        discount_code=discount_code_str,
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
            main_session_id=att.main_session_id,
            registration_mode=RegistrationMode.PORTAL_AUTHENTICATED.value,
            status=RegistrationStatus.REGISTERED_PENDING_INVOICE.value,
            notes=att.notes,
        )
        db.add(reg)
        await db.flush()

        # Create items (tutorials, add-ons)
        items = []
        for item_data in att.items or []:
            if item_data.item_type == "booking_option":
                # Find the booking option
                option = opt_map.get(item_data.booking_option_id)
                if not option:
                    continue

                item = RegistrationItem(
                    tenant_id=tenant_id,
                    conference_id=conference_id,
                    registration_id=reg.id,
                    item_type=item_data.item_type,
                    item_name=option.name,
                    booking_option_id=item_data.booking_option_id,
                    program_session_id=item_data.program_session_id,
                )
                db.add(item)
                items.append(item)

        if items:
            await db.flush()

        reg.billing_profile = billing
        registrations.append(reg)
        responses.append(
            RegistrationResponse(
                id=reg.id,
                tenant_id=reg.tenant_id,
                conference_id=reg.conference_id,
                billing_profile_id=reg.billing_profile_id,
                first_name=reg.first_name,
                last_name=reg.last_name,
                email=reg.email,
                pronouns=reg.pronouns,
                job_title=reg.job_title,
                department=reg.department,
                phone=reg.phone,
                booking_option_id=reg.booking_option_id,
                booking_option_name=opt_map[att.booking_option_id].name,
                main_session_id=reg.main_session_id,
                registration_mode=reg.registration_mode,
                status=reg.status,
                notes=reg.notes,
                created_by=None,  # Portal registrations have no created_by
                created_at=reg.created_at,
                updated_at=reg.updated_at,
                items=[
                    RegistrationItemResponse(
                        id=item.id,
                        item_type=item.item_type,
                        item_name=item.item_name,
                        booking_option_id=item.booking_option_id,
                        program_session_id=item.program_session_id,
                        pending=False,
                        notes=item.notes,
                        created_at=item.created_at,
                    )
                    for item in items
                ],
            )
        )

    # Create invoice
    try:
        invoice = await create_invoice_for_registrations(
            db=db,
            registrations=registrations,
            billing_profile=billing,
            conference=conference,
            tenant_id=tenant_id,
            current_user=None,  # No user context for portal registrations
        )
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Handle payment based on payment_intent_id
    payment_client_secret: str | None = None
    stripe_publishable_key: str | None = None
    payment_required = False

    if billing.payment_method == "credit_card":
        if payment_intent_id:
            # Payment-first flow: Payment already confirmed by frontend
            if invoice:
                invoice.status = "paid"
                invoice.stripe_payment_intent_id = payment_intent_id

                # Update PaymentIntent metadata
                try:
                    import stripe

                    stripe_settings = conference.settings.get("stripe", {})
                    secret_key = stripe_settings.get("secret_key")
                    if secret_key:
                        stripe.api_key = secret_key
                        stripe.PaymentIntent.modify(
                            payment_intent_id,
                            metadata={
                                "invoice_id": str(invoice.id),
                                "system": "saasconf",
                                "tenant_id": str(conference.tenant_id),
                                "conference_id": str(conference.id),
                            },
                        )
                        logger.info(f"Updated PaymentIntent {payment_intent_id} metadata with invoice_id {invoice.id}")
                except Exception as e:
                    logger.error(f"Failed to update PaymentIntent metadata: {e}")

                # Update registration statuses to PAID
                for reg in registrations:
                    reg.status = RegistrationStatus.PAID.value
                logger.info(f"Marked invoice {invoice.id} as paid with PaymentIntent {payment_intent_id}")
        else:
            # Legacy flow: Create PaymentIntent for frontend to confirm
            payment_required = True
            stripe_settings = conference.settings.get("stripe", {})
            if stripe_settings.get("is_enabled") and invoice:
                stripe_publishable_key = stripe_settings.get("publishable_key")
                try:
                    new_payment_intent_id, client_secret = await create_payment_intent(
                        db=db,
                        conference=conference,
                        invoice=invoice,
                    )
                    payment_client_secret = client_secret
                    logger.info(f"Created PaymentIntent {new_payment_intent_id} for invoice {invoice.id}")
                except ValidationError as e:
                    logger.error(f"Failed to create PaymentIntent for invoice {invoice.id}: {e}")
                    raise HTTPException(status_code=500, detail="Failed to initialize payment") from e
    else:
        # Bank transfer - mark as INVOICED
        if invoice:
            for reg in registrations:
                reg.status = RegistrationStatus.INVOICED.value

    await db.commit()

    # Post-commit: send emails
    for reg in registrations:
        try:
            _user, password_token = await create_user_for_registration(
                db=db,
                tenant_id=tenant_id,
                registration=reg,
            )
            await send_attendee_welcome_email(
                db=db,
                registration=reg,
                conference=conference,
                password_setup_token=password_token,
            )
        except Exception as e:
            logger.error(f"Failed to create user or send welcome email for registration {reg.id}: {e}")

    # Send invoice email to billing contact
    if invoice:
        try:
            await send_registration_invoice_email(
                db=db,
                invoice=invoice,
                conference=conference,
            )
        except Exception as e:
            logger.error(f"Failed to send invoice email: {e}")

    # Build response
    success_url = f"/{conference.tenant.slug}/portal/{conference.abbreviation}/registration-success"

    return PortalRegistrationResponse(
        billing_profile_id=billing.id,
        registrations=responses,
        payment_required=payment_required,
        payment_client_secret=payment_client_secret,
        stripe_publishable_key=stripe_publishable_key,
        success_url=success_url,
        is_alumni=is_alumni,
        alumni_conferences=alumni_conferences if is_alumni else None,
    )
