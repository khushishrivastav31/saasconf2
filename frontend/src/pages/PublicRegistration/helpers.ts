import type { PublicBookingPeriod, DiscountCodeValidation } from '../../types/publicRegistration';

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
