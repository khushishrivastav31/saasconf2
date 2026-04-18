"""Registration replacement - replace one attendee with another."""

import logging
import secrets
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.applicant_security import generate_email_verification_token
from app.core.email import send_email
from app.core.email_templates import build_registration_cancellation_context, render_email
from app.core.invoice_number import generate_invoice_number
from app.core.security import hash_password
from app.core.security.pii_crypto import hash_email, read_pii
from app.core.vat_calculation import calculate_vat_for_invoice
from app.models.audit import AuditLog
from app.models.booking import BookingOption, BookingPeriod
from app.models.conference import Conference
from app.models.invoice import Invoice
from app.models.registration import (
    Registration,
    RegistrationItem,
    RegistrationReplacement,
    RegistrationStatus,
)
from app.models.user import User
from app.models.user_conference_access import UserConferenceAccess
from app.schemas.invoice import InvoiceLineItem
from app.schemas.registration import AdditionalItemCreate, ReplaceAttendeeNewAttendeeData

logger = logging.getLogger(__name__)


async def replace_attendee(
    db: AsyncSession,
    old_registration: Registration,
    new_attendee_data: ReplaceAttendeeNewAttendeeData,
    additional_items: list[AdditionalItemCreate],
    conference: Conference,
    tenant_id: UUID,
    user_id: UUID,
    replacement_reason: str | None = None,
    cancellation_message: str | None = None,
) -> tuple[Registration, Registration, RegistrationReplacement, Invoice | None]:
    """
    Replace one attendee with another on an existing registration.

    Scenario A (no additional items):
        - Cancel old registration
        - Create new registration with same items
        - NO invoice changes
        - Send emails

    Scenario B (with additional items):
        - Cancel old registration
        - Create new registration with same items + additional
        - Create NEW invoice for additional items only
        - Send emails including invoice

    Args:
        db: Database session
        old_registration: Registration being replaced
        new_attendee_data: New attendee information
        additional_items: Additional items to add (empty = Scenario A)
        conference: Conference instance
        tenant_id: Tenant ID
        user_id: User performing replacement
        replacement_reason: Reason for replacement
        cancellation_message: Message to old attendee

    Returns:
        Tuple of (old_registration, new_registration, replacement_record, additional_invoice)
    """
    # Load old registration with relationships
    await db.refresh(
        old_registration,
        ["billing_profile", "items", "main_session"],
    )

    # Create snapshot of old items
    old_items_snapshot = [
        {
            "item_type": item.item_type,
            "item_name": item.item_name,
            "booking_option_id": str(item.booking_option_id) if item.booking_option_id else None,
            "program_session_id": str(item.program_session_id) if item.program_session_id else None,
        }
        for item in old_registration.items
    ]

    # Capture old registration data before deletion
    old_status = old_registration.status
    old_attendee_name = f"{old_registration.first_name} {old_registration.last_name}"
    old_attendee_email = old_registration.email
    old_tenant_id = old_registration.tenant_id

    # Remove old user's conference access (keep user account)
    access_removed = await _remove_conference_access(db, old_registration.email, conference.id)

    # Create new registration with SAME selections
    new_registration = Registration(
        tenant_id=tenant_id,
        conference_id=conference.id,
        billing_profile_id=old_registration.billing_profile_id,  # SAME billing profile
        first_name=new_attendee_data.first_name,
        last_name=new_attendee_data.last_name,
        email=new_attendee_data.email.lower(),
        pronouns=new_attendee_data.pronouns,
        job_title=new_attendee_data.job_title,
        department=new_attendee_data.department,
        phone=new_attendee_data.phone,
        booking_option_id=old_registration.booking_option_id,
        main_session_id=old_registration.main_session_id,
        registration_mode=old_registration.registration_mode,
        status=old_status if not additional_items else RegistrationStatus.REGISTERED_PENDING_INVOICE,
        notes=f"Replacement for {old_attendee_name}. {replacement_reason or ''}".strip(),
        created_by=user_id,
    )
    db.add(new_registration)
    await db.flush()

    # Copy old items to new registration
    for old_item in old_registration.items:
        new_item = RegistrationItem(
            tenant_id=tenant_id,
            registration_id=new_registration.id,
            item_type=old_item.item_type,
            booking_option_id=old_item.booking_option_id,
            program_session_id=old_item.program_session_id,
            item_name=old_item.item_name,
            pending=old_item.pending,
            notes=f"Copied from {old_attendee_name}",
        )
        db.add(new_item)

    await db.flush()

    # Add additional items (Scenario B)
    new_items = []
    if additional_items:
        new_items = await _create_additional_items(db, new_registration.id, additional_items, conference, tenant_id)
        await db.flush()

    # Generate invoice for additional items only (Scenario B)
    additional_invoice = None
    if additional_items:
        additional_invoice = await _create_incremental_invoice(
            db,
            new_registration,
            new_items,
            old_registration.billing_profile,
            conference,
            tenant_id,
        )
        new_registration.status = RegistrationStatus.INVOICED
        await db.flush()

    # Create new user account + conference access
    _new_user, password_token = await _create_user_and_access(db, new_registration, conference.id, tenant_id, user_id)

    # Create replacement audit record
    replacement_record = RegistrationReplacement(
        tenant_id=tenant_id,
        conference_id=conference.id,
        old_registration_id=old_registration.id,
        old_attendee_email=old_attendee_email,
        old_attendee_name=old_attendee_name,
        new_registration_id=new_registration.id,
        additional_items_invoice_id=additional_invoice.id if additional_invoice else None,
        replacement_reason=replacement_reason,
        has_additional_items=len(additional_items) > 0,
        replaced_by_user_id=user_id,
        old_items_snapshot=old_items_snapshot,
    )
    db.add(replacement_record)

    # Create audit log (use captured old_registration.id before deletion)
    old_registration_id = old_registration.id
    db.add(
        AuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action="registration.replaced",
            resource_type="registration",
            resource_id=old_registration_id,
            details={
                "old_attendee": old_attendee_name,
                "old_email": old_attendee_email,
                "new_attendee": f"{new_registration.first_name} {new_registration.last_name}",
                "new_email": new_registration.email,
                "replacement_id": str(replacement_record.id),
                "has_additional_items": replacement_record.has_additional_items,
                "access_removed": access_removed,
            },
        )
    )

    # Flush audit record and replacement record before deleting old registration
    # (RegistrationReplacement.old_registration_id will be SET NULL by DB cascade)
    await db.flush()

    # Hard-delete old registration (cascade deletes its RegistrationItems)
    # The old attendee's User account is preserved — only the registration is removed
    await db.delete(old_registration)

    await db.commit()

    # Send emails (after commit, best-effort)
    # Use captured values since old_registration is now deleted
    await _send_replacement_emails(
        db,
        old_attendee_name=old_attendee_name,
        old_attendee_email=old_attendee_email,
        old_tenant_id=old_tenant_id,
        new_registration=new_registration,
        conference=conference,
        additional_invoice=additional_invoice,
        password_token=password_token,
        cancellation_message=cancellation_message,
    )

    return old_registration, new_registration, replacement_record, additional_invoice


async def _remove_conference_access(db: AsyncSession, email: str, conference_id: UUID) -> int:
    """Remove conference access for old attendee."""
    result = await db.execute(select(User).where(User.email_hash == hash_email(email)))
    old_user = result.scalar_one_or_none()

    if not old_user:
        return 0

    result = await db.execute(
        delete(UserConferenceAccess).where(
            UserConferenceAccess.user_id == old_user.id,
            UserConferenceAccess.conference_id == conference_id,
        )
    )
    return result.rowcount or 0  # type: ignore[attr-defined]


async def _create_additional_items(
    db: AsyncSession,
    registration_id: UUID,
    additional_items: list[AdditionalItemCreate],
    conference: Conference,
    tenant_id: UUID,
) -> list[RegistrationItem]:
    """Create additional items for replacement."""
    created_items = []

    for item_data in additional_items:
        item_name = item_data.item_name

        # Fetch item name if not provided
        if not item_name:
            if item_data.booking_option_id:
                result = await db.execute(select(BookingOption).where(BookingOption.id == item_data.booking_option_id))
                booking_option = result.scalar_one_or_none()
                if booking_option:
                    item_name = booking_option.name
            elif item_data.program_session_id:
                # Import locally to avoid circular import
                from app.models.program import ProgramSession

                result = await db.execute(
                    select(ProgramSession).where(ProgramSession.id == item_data.program_session_id)
                )
                session = result.scalar_one_or_none()
                if session:
                    item_name = session.title  # type: ignore[attr-defined]

        if not item_name:
            item_name = "Additional item"

        new_item = RegistrationItem(
            tenant_id=tenant_id,
            registration_id=registration_id,
            item_type=item_data.item_type,
            booking_option_id=item_data.booking_option_id,
            program_session_id=item_data.program_session_id,
            item_name=item_name,
            pending=False,
            notes="Additional item from replacement",
        )
        db.add(new_item)
        created_items.append(new_item)

    return created_items


async def _create_incremental_invoice(
    db: AsyncSession,
    registration: Registration,
    additional_items: list[RegistrationItem],
    billing_profile,
    conference: Conference,
    tenant_id: UUID,
) -> Invoice:
    """
    Create invoice ONLY for additional items (not entire registration).

    Invoice is linked to the replacement via recipient_source_type="registration_replacement".
    """
    # Get active booking period
    result = await db.execute(
        select(BookingPeriod)
        .where(
            BookingPeriod.conference_id == conference.id,
            BookingPeriod.tenant_id == tenant_id,
            BookingPeriod.start_date <= date.today(),
            BookingPeriod.end_date >= date.today(),
            BookingPeriod.is_active.is_(True),
        )
        .order_by(BookingPeriod.start_date.desc())
        .limit(1)
    )
    booking_period = result.scalar_one_or_none()

    if not booking_period:
        # Fallback to latest period
        result = await db.execute(
            select(BookingPeriod)
            .where(
                BookingPeriod.conference_id == conference.id,
                BookingPeriod.tenant_id == tenant_id,
                BookingPeriod.is_active.is_(True),
            )
            .order_by(BookingPeriod.end_date.desc())
            .limit(1)
        )
        booking_period = result.scalar_one_or_none()

    # Generate line items ONLY for additional items
    line_items = []
    subtotal = Decimal("0.00")

    if booking_period and booking_period.prices:
        for item in additional_items:
            if item.booking_option_id:
                option_id_str = str(item.booking_option_id)
                if option_id_str in booking_period.prices:
                    price = Decimal(str(booking_period.prices[option_id_str]))
                    line_items.append(
                        InvoiceLineItem(
                            description=f"{item.item_name} (additional)",
                            quantity=1,
                            unit_price=float(price),
                            discount=0.0,
                            total=float(price),
                        )
                    )
                    subtotal += price

    # Create invoice
    recipient_name = (
        billing_profile.company_name or f"{billing_profile.contact_first_name} {billing_profile.contact_last_name}"
    )

    invoice = Invoice(
        tenant_id=tenant_id,
        conference_id=conference.id,
        template_type=billing_profile.payment_method or "bank_transfer",
        status="sent",
        issue_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        recipient_source_type="registration_replacement",  # OPTION D - links via replacement record
        recipient_source_id=billing_profile.id,  # Still links to billing profile for queries
        recipient_name=recipient_name,
        recipient_email=read_pii(billing_profile, "contact_email"),
        recipient_address_line1=billing_profile.street,
        recipient_city=billing_profile.city,
        recipient_postal_code=billing_profile.postal_code,
        recipient_country=billing_profile.country,
        recipient_vat_number=read_pii(billing_profile, "vat_number"),
        procurement_code=billing_profile.procurement_code,
        line_items=[item.model_dump() for item in line_items],
        subtotal=float(subtotal),
        currency=booking_period.currency if booking_period else "EUR",
        is_active=True,
    )

    # Auto-calculate VAT
    tax_rate, tax_amount, vat_notes = await calculate_vat_for_invoice(invoice, conference, db)
    invoice.tax_rate = tax_rate
    invoice.tax_amount = tax_amount
    total_amount = subtotal + Decimal(str(tax_amount))
    invoice.total = float(total_amount)  # type: ignore[assignment]
    invoice.vat_auto_calculated = True

    # Add notes
    attendee_name = f"{registration.first_name} {registration.last_name}"
    invoice.notes = (
        f"Additional items for {attendee_name} (Registration Replacement)\n\n{vat_notes}"
        if vat_notes
        else f"Additional items for {attendee_name} (Registration Replacement)"
    )

    # Assign invoice number
    invoice.invoice_number = await generate_invoice_number(db, conference.id, tenant_id)

    db.add(invoice)
    await db.flush()

    return invoice


async def _create_user_and_access(
    db: AsyncSession,
    registration: Registration,
    conference_id: UUID,
    tenant_id: UUID,
    granted_by: UUID,
) -> tuple[User, str]:
    """Create portal user + conference access for new attendee."""
    # Check if user already exists
    result = await db.execute(select(User).where(User.email_hash == hash_email(registration.email)))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        # User exists, just add conference access
        access = UserConferenceAccess(
            user_id=existing_user.id,
            conference_id=conference_id,
            granted_by=granted_by,
        )
        db.add(access)
        await db.flush()
        return existing_user, ""  # No password token needed

    # Create new user with random password
    random_password = secrets.token_urlsafe(32)
    password_hash = hash_password(random_password)

    new_user = User(
        email=registration.email.lower(),
        first_name=registration.first_name,
        last_name=registration.last_name,
        is_active=True,
        role="user",
        tenant_id=tenant_id,
        password_hash=password_hash,
    )
    db.add(new_user)
    await db.flush()

    # Create conference access
    access = UserConferenceAccess(
        user_id=new_user.id,
        conference_id=conference_id,
        granted_by=granted_by,
    )
    db.add(access)

    # Generate password setup token
    raw_token, _token_hash = generate_email_verification_token()

    return new_user, raw_token


async def _send_replacement_emails(
    db: AsyncSession,
    *,
    old_attendee_name: str,
    old_attendee_email: str,
    old_tenant_id: UUID,
    new_registration: Registration,
    conference: Conference,
    additional_invoice: Invoice | None,
    password_token: str,
    cancellation_message: str | None,
) -> dict[str, bool]:
    """Send all replacement emails."""
    emails_sent = {}

    # Send cancellation email to old attendee
    try:
        context = build_registration_cancellation_context(
            registration_name=old_attendee_name,
            conference_name=conference.name,
            invoice_number="",
            cancellation_message=cancellation_message or "Your registration has been transferred to another attendee.",
        )
        from app.schemas.email_template import EmailTemplateType

        rendered = await render_email(
            db,
            EmailTemplateType.REGISTRATION_CANCELLATION,
            context,
            conference_id=conference.id,
            tenant_id=old_tenant_id,
        )
        emails_sent["old_attendee"] = await send_email(
            to=old_attendee_email,
            subject=rendered.subject,
            html=rendered.body_html,
            text=rendered.body_text,
            db=db,
            tenant_id=old_tenant_id,
            conference_id=conference.id,
            email_type="registration_replacement",
        )
    except Exception as e:
        logger.error(f"Failed to send cancellation email: {e}")
        emails_sent["old_attendee"] = False

    # Send welcome email to new attendee
    try:
        # Build welcome context
        password_link: str = (
            f"https://app.example.com/set-password?token={password_token}"
            if password_token
            else "Already have an account"
        )
        invoice_info: str = (
            additional_invoice.invoice_number
            if additional_invoice and additional_invoice.invoice_number
            else "No additional charges"
        )
        welcome_context: dict[str, str] = {
            "Attendee Name": f"{new_registration.first_name} {new_registration.last_name}",
            "Conference Name": conference.name,
            "Password Setup Link": password_link,
            "Invoice Number": invoice_info,
        }

        # Use existing welcome template if available
        from app.schemas.email_template import EmailTemplateType

        try:
            rendered = await render_email(
                db,
                EmailTemplateType.ATTENDEE_WELCOME,
                welcome_context,
                conference_id=conference.id,
                tenant_id=new_registration.tenant_id,
            )
            subject = rendered.subject
            html = rendered.body_html
            text = rendered.body_text
        except Exception:
            # Fallback to simple email
            subject = f"Welcome to {conference.name}"
            html = f"""
            <h2>Welcome to {conference.name}</h2>
            <p>Dear {new_registration.first_name},</p>
            <p>You have been registered for {conference.name}.</p>
            {f'<p><a href="{password_link}">Set up your password</a></p>' if password_link else ""}
            """
            text = f"Welcome to {conference.name}"

        emails_sent["new_attendee"] = await send_email(
            to=new_registration.email,
            subject=subject,
            html=html,
            text=text,
            db=db,
            tenant_id=new_registration.tenant_id,
            conference_id=conference.id,
            email_type="registration_replacement",
        )
    except Exception as e:
        logger.error(f"Failed to send welcome email: {e}")
        emails_sent["new_attendee"] = False

    # Send invoice email (Scenario B only)
    if additional_invoice:
        try:
            from app.core.invoice_email import send_invoice_email

            emails_sent["invoice"] = await send_invoice_email(
                db,
                additional_invoice,
                conference,
            )
        except Exception as e:
            logger.error(f"Failed to send invoice email: {e}")
            emails_sent["invoice"] = False

    return emails_sent
