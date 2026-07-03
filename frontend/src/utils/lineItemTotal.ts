/**
 * Compute an invoice line-item total from its quantity, unit price, and a
 * discount. A line carries at most one discount kind: a fixed amount or a
 * percentage (0–100). The percentage takes precedence when set; the result is
 * clamped at 0 (credit-note negatives are handled separately, not here).
 */
export function lineItemTotal(
  quantity: number,
  unitPrice: number,
  discount?: number | null,
  discountPercentage?: number | null
): number {
  const gross = quantity * unitPrice;
  const total = discountPercentage
    ? gross * (1 - discountPercentage / 100)
    : gross - (discount || 0);
  return total < 0 ? 0 : total;
}
