"""CFP-portal *write-side* services: Stripe PI + authenticated registration.

Pairs with :mod:`app.services.cfp_portal_registration_service` (the
read-only queries) to keep each module under the 600-LOC guardrail.

Pure business logic — no FastAPI ``Request``/``HTTPException`` coupling.
Routers parse params, verify the applicant session, then delegate here.
"""

from __future__ import annotations

import logging
from datetime import date as date_type
from uuid import UUID

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.registrations._helpers import (
    _build_response,
    _check_email_unique,
    _create_items,
    _send_registration_emails,
)
from app.config import get_settings
from app.core.alumni_discount import validate_alumni_discount
from app.core.default_settings import BANK_TRANSFER_COUNTRIES
from app.core.exceptions import NotFoundError, ValidationError
from app.core.invoice_auto_generation import create_invoice_for_registrations
from app.core.stripe_helper import create_payment_intent as create_stripe_payment_intent
from app.core.user_auto_creation import create_user_for_registration
from app.models.booking import BookingOption, DiscountCode
from app.models.registration import BillingProfile, Registration, RegistrationMode, RegistrationStatus
from app.models.tenant import Tenant
from app.schemas.portal_registration import PortalRegistrationRequest, PortalRegistrationResponse
from app.schemas.registration import RegistrationResponse
from app.services.cfp_portal_registration_service import get_active_conference

logger = logging.getLogger(__name__)


# =============================================================================
# Stripe PaymentIntent (preview, before commit)
# =============================================================================


async def create_preview_payment_intent(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    applicant_id: UUID,
    applicant_email: str,
    amount: float,
    currency: str,
) -> dict:
    settings = get_settings()
    conference = await get_active_conference(db, conference_id=conference_id, tenant_id=tenant_id)

    stripe_settings = (conference.settings or {}).get("stripe", {})
    if not stripe_settings.get("is_enabled"):
        raise ValidationError("Credit card payments are not enabled for this conference")

    publishable_key = stripe_settings.get("publishable_key") or getattr(settings, "STRIPE_PUBLISHABLE_KEY", None)
    secret_key = stripe_settings.get("secret_key") or getattr(settings, "STRIPE_SECRET_KEY", None)

    if not secret_key or not publishable_key:
        raise ValidationError("Stripe is not properly configured")
    if amount <= 0:
        raise ValidationError("Amount must be greater than 0")

    stripe.api_key = secret_key

    try:
        payment_intent = stripe.PaymentIntent.create(
            amount=int(amount),
            currency=currency.lower(),
            metadata={
                "system": "saasconf",
                "tenant_id": str(tenant_id),
                "conference_id": str(conference_id),
                "applicant_id": str(applicant_id),
                "preview": "true",
            },
        )
    except stripe.error.StripeError as e:
        logger.error(f"Stripe PaymentIntent creation failed: {e}")
        raise ValidationError(f"Stripe error: {e!s}") from e

    if not payment_intent.client_secret:
        raise ValidationError("Failed to create payment intent")

    logger.info(f"Created preview PaymentIntent {payment_intent.id} for authenticated user {applicant_email}")

    return {
        "payment_intent_id": payment_intent.id,
        "client_secret": payment_intent.client_secret,
        "publishable_key": publishable_key,
    }


async def update_preview_payment_intent(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    payment_intent_id: str,
    amount: float,
) -> dict:
    settings = get_settings()
    conference = await get_active_conference(db, conference_id=conference_id, tenant_id=tenant_id)

    stripe_settings = (conference.settings or {}).get("stripe", {})
    secret_key = stripe_settings.get("secret_key") or getattr(settings, "STRIPE_SECRET_KEY", None)
    publishable_key = stripe_settings.get("publishable_key") or getattr(settings, "STRIPE_PUBLISHABLE_KEY", None)

    if not secret_key or not publishable_key:
        raise ValidationError("Stripe is not properly configured")
    if amount <= 0:
        raise ValidationError("Amount must be greater than 0")

    stripe.api_key = secret_key

    try:
        payment_intent = stripe.PaymentIntent.modify(payment_intent_id, amount=int(amount))
    except stripe.error.StripeError as e:
        logger.error(f"Stripe PaymentIntent update failed for {payment_intent_id}: {e}")
        raise ValidationError(f"Stripe error: {e!s}") from e

    if not payment_intent.client_secret:
        raise ValidationError("Failed to update payment intent")

    logger.info(f"Updated PaymentIntent {payment_intent_id} to {amount / 100}")
    return {"client_secret": payment_intent.client_secret, "publishable_key": publishable_key}


# =============================================================================
# Authenticated registration flow
# =============================================================================


async def _resolve_discount_code(
    db: AsyncSession,
    *,
    conference_id: UUID,
    requested_code: str | None,
    is_alumni: bool,
    alumni_discount: DiscountCode | None,
    user_email: str,
) -> str | None:
    if requested_code:
        if requested_code.upper() == "ALUMNI":
            if not is_alumni:
                raise ValidationError("ALUMNI discount code is only for past attendees")
            if not alumni_discount:
                raise ValidationError("ALUMNI discount code is not currently available")
            return "ALUMNI"

        dc_result = await db.execute(
            select(DiscountCode).where(
                DiscountCode.conference_id == conference_id,
                DiscountCode.code == requested_code.upper(),
                DiscountCode.is_active == True,
            )
        )
        dc = dc_result.scalar_one_or_none()
        if not dc:
            raise ValidationError(f"Invalid discount code: {requested_code}")

        today = date_type.today()
        if dc.start_date and today < dc.start_date:
            raise ValidationError("This discount code is not valid yet")
        if dc.end_date and today > dc.end_date:
            raise ValidationError("This discount code has expired")
        if dc.max_uses > 0 and dc.usage_count >= dc.max_uses:
            raise ValidationError("This discount code has reached its maximum usage limit")
        return dc.code

    if is_alumni and alumni_discount:
        logger.info(f"Auto-applying ALUMNI discount for user {user_email} at conference {conference_id}")
        return "ALUMNI"

    return None


async def _load_booking_options(
    db: AsyncSession, *, tenant_id: UUID, conference_id: UUID, option_ids: set[UUID]
) -> dict[UUID, BookingOption]:
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
    return opt_map


def _enforce_bank_transfer_country(conference, billing_country: str | None, payment_method: str | None) -> None:
    conf_settings = conference.settings or {}
    stripe_enabled = conf_settings.get("stripe", {}).get("is_enabled", False)
    if not (stripe_enabled and payment_method == "bank_transfer"):
        return
    allowed = conf_settings.get("bank_transfer_countries", BANK_TRANSFER_COUNTRIES)
    country = (billing_country or "").strip().upper()
    if country not in allowed:
        raise ValidationError(
            "Bank transfer is not available for your billing country. Please use credit card payment."
        )


async def _finalize_credit_card_with_intent(
    conference, invoice, payment_intent_id: str, registrations: list[Registration]
) -> None:
    if not invoice:
        return
    invoice.status = "paid"
    invoice.stripe_payment_intent_id = payment_intent_id

    try:
        stripe_settings = (conference.settings or {}).get("stripe", {})
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

    for reg in registrations:
        reg.status = RegistrationStatus.PAID.value
    logger.info(f"Marked invoice {invoice.id} as paid with PaymentIntent {payment_intent_id}")


async def create_authenticated_registration(
    db: AsyncSession,
    *,
    tenant_id: UUID,
    conference_id: UUID,
    applicant_id: UUID,
    applicant_email: str,
    data: PortalRegistrationRequest,
) -> tuple[PortalRegistrationResponse, list[Registration], object | None, dict[UUID, str]]:
    """Main authenticated-portal registration flow.

    Returns ``(response, registrations, invoice, password_setup_tokens)``.
    The router is responsible for dispatching the registration emails via
    ``BackgroundTasks`` after the response is built, so the DB session
    used here can still be committed cleanly.
    """
    conference = await get_active_conference(db, conference_id=conference_id, tenant_id=tenant_id)

    tenant_result = await db.execute(select(Tenant.slug).where(Tenant.id == tenant_id))
    tenant_slug = tenant_result.scalar_one()

    is_alumni, alumni_discount, alumni_conferences = await validate_alumni_discount(
        db=db,
        tenant_id=tenant_id,
        conference_id=conference_id,
        user_email=applicant_email,
    )

    discount_code_str = await _resolve_discount_code(
        db,
        conference_id=conference_id,
        requested_code=data.discount_code,
        is_alumni=is_alumni,
        alumni_discount=alumni_discount,
        user_email=applicant_email,
    )

    option_ids = {att.booking_option_id for att in data.attendees}
    opt_map = await _load_booking_options(db, tenant_id=tenant_id, conference_id=conference_id, option_ids=option_ids)

    _enforce_bank_transfer_country(conference, data.billing.country, data.billing.payment_method)

    billing = BillingProfile(
        tenant_id=tenant_id,
        conference_id=conference_id,
        **data.billing.model_dump(exclude={"payment_method", "payment_intent_id", "discount_code"}),
        payment_method=data.billing.payment_method or "credit_card",
        discount_code=discount_code_str,
    )
    db.add(billing)
    await db.flush()

    registrations: list[Registration] = []
    responses: list[RegistrationResponse] = []
    for att in data.attendees:
        await _check_email_unique(db, conference_id, att.email)

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
            registration_mode=RegistrationMode.PORTAL.value,
            status=RegistrationStatus.REGISTERED_PENDING_INVOICE.value,
            notes=att.notes,
        )
        db.add(reg)
        await db.flush()

        items = await _create_items(db, reg, att.items or [], conference_id, tenant_id, conference)
        if items:
            await db.flush()

        registrations.append(reg)
        option_name = opt_map[att.booking_option_id].name if att.booking_option_id in opt_map else None
        responses.append(_build_response(reg, option_name=option_name, items=items))

    invoice = await create_invoice_for_registrations(
        db=db,
        registrations=registrations,
        billing_profile=billing,
        conference=conference,
        tenant_id=tenant_id,
        current_user=None,
    )

    payment_client_secret: str | None = None
    stripe_publishable_key: str | None = None
    payment_required = False
    payment_intent_id = data.billing.payment_intent_id

    if billing.payment_method == "credit_card":
        if payment_intent_id:
            await _finalize_credit_card_with_intent(conference, invoice, payment_intent_id, registrations)
        else:
            payment_required = True
            stripe_settings = conference.settings.get("stripe", {}) if conference.settings else {}
            if stripe_settings.get("is_enabled") and invoice:
                stripe_publishable_key = stripe_settings.get("publishable_key")
                try:
                    new_pi_id, client_secret = await create_stripe_payment_intent(
                        db=db, conference=conference, invoice=invoice
                    )
                    payment_client_secret = client_secret
                    logger.info(f"Created PaymentIntent {new_pi_id} for invoice {invoice.id}")
                except ValidationError as e:
                    logger.error(f"Failed to create PaymentIntent for invoice {invoice.id}: {e}")
                    raise ValidationError("Failed to initialize payment") from e
    else:
        if invoice:
            for reg in registrations:
                reg.status = RegistrationStatus.INVOICED.value

    await db.commit()

    user_tokens: list[tuple[Registration, str]] = []
    for reg in registrations:
        try:
            _user, raw_token = await create_user_for_registration(db=db, tenant_id=tenant_id, registration=reg)
            if raw_token:
                user_tokens.append((reg, raw_token))
        except Exception as e:
            logger.error(f"Failed to create user for registration {reg.id}: {e}")

    password_setup_tokens = {reg.id: token for reg, token in user_tokens}

    success_url = f"/{tenant_slug}/portal/{conference.abbreviation}/registration-success"
    response = PortalRegistrationResponse(
        billing_profile_id=billing.id,
        registrations=responses,
        payment_required=payment_required,
        payment_client_secret=payment_client_secret,
        stripe_publishable_key=stripe_publishable_key,
        success_url=success_url,
        is_alumni=is_alumni,
        alumni_conferences=alumni_conferences if is_alumni else None,
    )
    return response, registrations, invoice, password_setup_tokens


async def send_registration_emails_async(
    *,
    db: AsyncSession,
    registrations: list[Registration],
    conference,
    invoice,
    password_setup_tokens: dict[UUID, str],
) -> None:
    """Thin wrapper so the router can hand this to ``BackgroundTasks``."""
    await _send_registration_emails(
        db=db,
        registrations=registrations,
        conference=conference,
        invoice=invoice,
        password_setup_tokens=password_setup_tokens,
    )


__all__ = [
    "NotFoundError",
    "create_authenticated_registration",
    "create_preview_payment_intent",
    "send_registration_emails_async",
    "update_preview_payment_intent",
]
