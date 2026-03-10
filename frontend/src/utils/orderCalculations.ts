/**
 * Shared order calculation utilities
 *
 * This module provides a single source of truth for discount and VAT calculations
 * across all registration flows (admin, public, authenticated portal).
 *
 * The logic mirrors the backend implementation in:
 * - /backend/app/core/invoice_line_items.py
 * - /backend/app/core/discount_code_validation.py
 */

import type { DiscountCodeValidation } from '../types/publicRegistration';

export interface OrderLineItem {
  optionId: string;
  optionName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number; // (unitPrice - discountAmount) * quantity
}

export interface OrderTotals {
  lineItems: OrderLineItem[];
  subtotal: number; // Sum of lineTotal (after discounts)
  totalDiscount: number; // Sum of all discount amounts
  vatRate: number;
  vatAmount: number;
  total: number; // subtotal + vatAmount
}

/**
 * Check if discount applies to a specific option and period
 * Mirrors backend check_discount_applies() logic
 */
function checkDiscountApplies(
  discount: DiscountCodeValidation | null,
  optionId: string,
  periodId: string
): boolean {
  if (!discount || !discount.valid) {
    return false;
  }

  // Check option restrictions (if any)
  if (discount.applicable_option_ids && discount.applicable_option_ids.length > 0) {
    if (!discount.applicable_option_ids.includes(optionId)) {
      return false; // Option not in allowed list
    }
  }

  // Check period restrictions (if any)
  if (discount.applicable_period_ids && discount.applicable_period_ids.length > 0) {
    if (!discount.applicable_period_ids.includes(periodId)) {
      return false; // Period not in allowed list
    }
  }

  return true;
}

/**
 * Calculate discount amount for a single line item
 * Mirrors backend calculate_discount_for_item() logic
 */
function calculateDiscountAmount(discount: DiscountCodeValidation, unitPrice: number): number {
  const discountValue = discount.discount_value || 0;

  if (discount.discount_type === 'percentage') {
    return (unitPrice * discountValue) / 100;
  } else if (discount.discount_type === 'fixed') {
    // Fixed discount cannot exceed unit price
    return Math.min(discountValue, unitPrice);
  }
  return 0;
}

/**
 * Generate order line items with discounts applied
 * Mirrors backend generate_line_items_from_registration() logic
 *
 * @param bookingOptions - Array of [optionId, optionName, unitPrice] tuples
 * @param periodId - Active booking period ID
 * @param discount - Validated discount code (if any)
 * @returns Array of line items with discounts applied
 */
export function calculateOrderLineItems(
  bookingOptions: Array<{ optionId: string; optionName: string; unitPrice: number }>,
  periodId: string,
  discount: DiscountCodeValidation | null
): OrderLineItem[] {
  const lineItems: OrderLineItem[] = [];

  bookingOptions.forEach(({ optionId, optionName, unitPrice }) => {
    let discountAmount = 0;

    if (discount && discount.valid) {
      // Check if discount applies to this option/period combination
      const applies = checkDiscountApplies(discount, optionId, periodId);

      if (applies) {
        discountAmount = calculateDiscountAmount(discount, unitPrice);
      }
    }

    const lineTotal = unitPrice - discountAmount;

    lineItems.push({
      optionId,
      optionName,
      quantity: 1,
      unitPrice,
      discountAmount,
      lineTotal,
    });
  });

  return lineItems;
}

/**
 * Group line items by option (for multi-attendee registrations)
 * Mirrors backend generate_line_items_for_bulk_registrations() logic
 *
 * Groups items with same (optionId, unitPrice, discountAmount) and sums quantity
 */
export function groupLineItems(lineItems: OrderLineItem[]): OrderLineItem[] {
  // Map: optionId + unitPrice + discountAmount -> aggregated item
  const grouped = new Map<string, OrderLineItem>();

  lineItems.forEach((item) => {
    const key = `${item.optionId}-${item.unitPrice}-${item.discountAmount}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.quantity += item.quantity;
      existing.lineTotal = (existing.unitPrice - existing.discountAmount) * existing.quantity;
    } else {
      grouped.set(key, { ...item });
    }
  });

  return Array.from(grouped.values());
}

/**
 * Calculate complete order totals
 *
 * @param lineItems - Line items (can be grouped or individual)
 * @param vatRate - VAT rate (e.g., 19 for 19%)
 * @param vatAmount - VAT amount (if already calculated)
 * @returns Complete order totals
 */
export function calculateOrderTotals(
  lineItems: OrderLineItem[],
  vatRate: number = 0,
  vatAmount: number = 0
): OrderTotals {
  // Calculate subtotal (sum of line totals after discount)
  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);

  // Calculate total discount
  const totalDiscount = lineItems.reduce(
    (sum, item) => sum + item.discountAmount * item.quantity,
    0
  );

  // Calculate total
  const total = subtotal + vatAmount;

  return {
    lineItems,
    subtotal,
    totalDiscount,
    vatRate,
    vatAmount,
    total,
  };
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
