"""Invoice line item generation helpers."""

import logging
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.discount_code_validation import calculate_discount_for_item, check_discount_applies_to_option
from app.models.booking import BookingOption, BookingPeriod, DiscountCode
from app.models.program import ProgramSession
from app.models.registration import Registration, RegistrationItem
from app.schemas.invoice import InvoiceLineItem

logger = logging.getLogger(__name__)


async def generate_line_items_from_registration(
    db: AsyncSession,
    registration: Registration,
    booking_period: BookingPeriod,
    discount_code: DiscountCode | None = None,
) -> tuple[list[InvoiceLineItem], Decimal, Decimal]:
    """Generate invoice line items from a registration's booking option and add-ons.

    Creates one line item for the main booking option and additional line items
    for each RegistrationItem add-on. If a RegistrationItem exists for the main
    booking option (e.g., with session selection), its item_name is used instead
    of the plain booking option name to avoid double invoicing.

    Args:
        db: Database session
        registration: Registration model instance
        booking_period: Active booking period for pricing
        discount_code: Optional discount code to apply per line item

    Returns:
        Tuple of (line_items, subtotal, total_discount)
    """
    line_items: list[InvoiceLineItem] = []
    subtotal = Decimal("0.00")
    total_discount = Decimal("0.00")

    # Get main booking option
    booking_option_stmt = select(BookingOption).where(BookingOption.id == registration.booking_option_id)
    booking_option_result = await db.execute(booking_option_stmt)
    booking_option = booking_option_result.scalar_one_or_none()

    if not booking_option:
        logger.error(f"Booking option {registration.booking_option_id} not found for registration {registration.id}")
        return (line_items, subtotal, total_discount)

    # Get price for main booking option from booking period
    option_id_str = str(booking_option.id)
    price = Decimal("0.00")

    if booking_period.prices and option_id_str in booking_period.prices:
        price = Decimal(str(booking_period.prices[option_id_str]))
    else:
        logger.warning(f"No price found for option {option_id_str} in period {booking_period.id}")

    # Query for RegistrationItems (add-ons only)
    items_stmt = select(RegistrationItem).where(RegistrationItem.registration_id == registration.id)
    items_result = await db.execute(items_stmt)
    items = items_result.scalars().all()

    # Build main line item description with session info if applicable
    main_description = booking_option.name

    # Check if main booking has a session selection
    if registration.main_session_id:
        session_result = await db.execute(
            select(ProgramSession).where(ProgramSession.id == registration.main_session_id)
        )
        session = session_result.scalar_one_or_none()
        if session and session.title:
            main_description = f"{booking_option.name} - {session.title}"

    # Check if discount applies to main option
    discount_for_main = Decimal("0.00")
    if discount_code:
        applies = await check_discount_applies_to_option(db, discount_code.id, booking_option.id)
        if applies:
            discount_for_main = calculate_discount_for_item(discount_code, price)
            logger.debug(f"Discount {discount_for_main} applies to main option {booking_option.name}")

    line_items.append(
        InvoiceLineItem(
            description=main_description,
            quantity=1,
            unit_price=float(price),
            discount=float(discount_for_main),
            total=float(price - discount_for_main),
        )
    )
    subtotal += price
    total_discount += discount_for_main

    # Add RegistrationItem add-ons (tutorials, extra day passes, etc.)
    # SKIP items whose booking_option_id matches the main booking option to prevent double invoicing
    for item in items:
        # Skip if this is the main booking option (already added above)
        if item.booking_option_id == registration.booking_option_id:
            continue

        item_price = Decimal("0.00")

        # Get price from booking period if this item has a booking_option_id
        if item.booking_option_id:
            item_option_id_str = str(item.booking_option_id)
            if booking_period.prices and item_option_id_str in booking_period.prices:
                item_price = Decimal(str(booking_period.prices[item_option_id_str]))
            else:
                logger.warning(f"No price found for add-on option {item_option_id_str} in period {booking_period.id}")

        # Check if discount applies to this add-on
        item_discount = Decimal("0.00")
        if discount_code and item.booking_option_id:
            applies = await check_discount_applies_to_option(db, discount_code.id, item.booking_option_id)
            if applies:
                item_discount = calculate_discount_for_item(discount_code, item_price)

        line_items.append(
            InvoiceLineItem(
                description=item.item_name,
                quantity=1,
                unit_price=float(item_price),
                discount=float(item_discount),
                total=float(item_price - item_discount),
            )
        )
        subtotal += item_price
        total_discount += item_discount

    return (line_items, subtotal, total_discount)


async def generate_line_items_for_bulk_registrations(
    db: AsyncSession,
    registrations: list[Registration],
    booking_period: BookingPeriod,
    discount_code: DiscountCode | None = None,
) -> tuple[list[InvoiceLineItem], Decimal, Decimal]:
    """Generate consolidated line items for multiple registrations (bulk invoice).

    Groups line items by (description, unit_price, discount) and sums quantities.
    This creates a consolidated invoice like "Tutorial (x3), Day 1 (x2)".

    Args:
        db: Database session
        registrations: List of Registration model instances
        booking_period: Active booking period for pricing
        discount_code: Optional discount code to apply per line item

    Returns:
        Tuple of (line_items, subtotal, total_discount)
    """
    # Map: (description, unit_price, discount) -> quantity
    line_map: dict[tuple[str, float, float], int] = {}

    # Generate line items for each registration and consolidate
    for reg in registrations:
        items, _, _ = await generate_line_items_from_registration(db, reg, booking_period, discount_code)
        for item in items:
            key = (item.description, item.unit_price, item.discount)
            line_map[key] = line_map.get(key, 0) + int(item.quantity)

    # Convert map to line items list
    line_items: list[InvoiceLineItem] = []
    subtotal = Decimal("0.00")
    total_discount = Decimal("0.00")

    for (description, unit_price, discount), quantity in line_map.items():
        item_subtotal = Decimal(str(unit_price)) * quantity
        item_total_discount = Decimal(str(discount)) * quantity
        total = item_subtotal - item_total_discount

        line_items.append(
            InvoiceLineItem(
                description=description,
                quantity=quantity,
                unit_price=unit_price,
                discount=discount,
                total=float(total),
            )
        )
        subtotal += item_subtotal
        total_discount += item_total_discount

    return (line_items, subtotal, total_discount)
