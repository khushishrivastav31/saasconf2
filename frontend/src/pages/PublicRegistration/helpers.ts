import type {
  PublicBookingPeriod,
  DiscountCodeValidation,
  PortalAttendee,
  TransformedAttendee,
  TransformedAttendeeItem,
} from '../../types/publicRegistration';

/**
 * Get the current active period price for a booking option
 */
export function getCurrentPrice(
  optionId: string,
  periods: PublicBookingPeriod[]
): { price: number; currency: string; periodName: string } | null {
  const today = new Date().toISOString().slice(0, 10);
  const active = periods.find((p) => p.start_date <= today && p.end_date >= today);
  if (!active || !active.prices) return null;
  const price = active.prices[optionId];
  if (price == null) return null;
  return { price, currency: 'EUR', periodName: active.name };
}

/**
 * Format price with currency
 */
export function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(price);
  } catch {
    return `${price.toFixed(2)} ${currency}`;
  }
}

/**
 * Apply discount to a price
 */
export function applyDiscount(
  price: number,
  discount: DiscountCodeValidation | null,
  optionId?: string,
  periodId?: string
): { discountedPrice: number; discountAmount: number } {
  if (!discount || !discount.valid || !discount.discount_value) {
    return { discountedPrice: price, discountAmount: 0 };
  }

  // Check if discount applies to this option (if restricted)
  if (
    discount.applicable_option_ids &&
    discount.applicable_option_ids.length > 0 &&
    optionId &&
    !discount.applicable_option_ids.includes(optionId)
  ) {
    return { discountedPrice: price, discountAmount: 0 };
  }

  // Check if discount applies to this period (if restricted)
  if (
    discount.applicable_period_ids &&
    discount.applicable_period_ids.length > 0 &&
    periodId &&
    !discount.applicable_period_ids.includes(periodId)
  ) {
    return { discountedPrice: price, discountAmount: 0 };
  }

  // Calculate discount
  let discountAmount = 0;
  if (discount.discount_type === 'percentage') {
    discountAmount = (price * discount.discount_value) / 100;
  } else if (discount.discount_type === 'fixed') {
    discountAmount = discount.discount_value;
  }

  const discountedPrice = Math.max(0, price - discountAmount);

  return { discountedPrice, discountAmount };
}

/**
 * Transform attendees for backend submission.
 * First booking option becomes primary (booking_option_id), rest become items.
 * Session selections are mapped to main_session_id and item-level program_session_id.
 */
export function transformAttendees(
  attendees: PortalAttendee[],
  sessionSelections: Record<number, Record<string, Record<string, string>>>
): TransformedAttendee[] {
  return attendees.map((att, attendeeIndex) => {
    const bookingIds = att.booking_option_ids || [];
    const [primaryId, ...additionalIds] = bookingIds;

    // Collect all session selections for this attendee
    const attendeeSessions = sessionSelections[attendeeIndex] || {};

    // Find session for primary booking option (goes to main_session_id)
    let mainSessionId: string | null = null;
    if (primaryId && attendeeSessions[primaryId]) {
      const primarySlots = attendeeSessions[primaryId];
      // Get first selected session for primary option
      const sessionId = Object.values(primarySlots).find((id) => id);
      if (sessionId) {
        mainSessionId = sessionId;
      }
    }

    // Build items array for additional options and their sessions
    const items: TransformedAttendeeItem[] = [];

    // Add additional booking options (without sessions for now)
    additionalIds.forEach((id) => {
      const hasSession = attendeeSessions[id];
      if (!hasSession) {
        // No session for this option - add as simple item
        items.push({
          item_type: 'booking_option' as const,
          booking_option_id: id,
        });
      }
    });

    // Add sessions for additional options
    Object.entries(attendeeSessions).forEach(([optionId, slotSelections]) => {
      // Skip primary option (already handled as main_session_id)
      if (optionId === primaryId) return;

      Object.entries(slotSelections).forEach(([, sessionId]) => {
        if (sessionId) {
          items.push({
            item_type: 'booking_option' as const,
            booking_option_id: optionId,
            program_session_id: sessionId,
          });
        }
      });
    });

    return {
      ...att,
      booking_option_id: primaryId,
      main_session_id: mainSessionId,
      items,
    };
  });
}
