import type { DiscountCode, DiscountCodeCreate } from '../../../../types';

export interface DiscountFormValues {
  description: string;
  code: string;
  discountType: 'fixed' | 'percentage';
  discountValue: string;
  effectiveCurrency: string | null | undefined;
  startDate: string;
  endDate: string;
  maxUses: string;
  isActive: boolean;
  isCombinable: boolean;
  applicableOptions: string[];
  applicablePeriods: string[];
}

/** Build a partial-update payload containing only fields changed from `discount`. */
export function buildDiscountUpdates(
  discount: DiscountCode,
  v: DiscountFormValues
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  if (v.description.trim() !== (discount.description || ''))
    updates.description = v.description.trim();
  if (v.code.trim().toUpperCase() !== discount.code) updates.code = v.code.trim().toUpperCase();
  if (v.discountType !== discount.discount_type) updates.discount_type = v.discountType;
  if (parseFloat(v.discountValue) !== discount.discount_value)
    updates.discount_value = parseFloat(v.discountValue);

  const newCurrency =
    v.discountType === 'fixed' && v.effectiveCurrency ? v.effectiveCurrency : null;
  if (newCurrency !== discount.currency) updates.currency = newCurrency;

  const newStartDate = v.startDate || null;
  if (newStartDate !== discount.start_date) updates.start_date = newStartDate;

  const newEndDate = v.endDate || null;
  if (newEndDate !== discount.end_date) updates.end_date = newEndDate;

  if (parseInt(v.maxUses) !== discount.max_uses) updates.max_uses = parseInt(v.maxUses) || 0;
  if (v.isActive !== discount.is_active) updates.is_active = v.isActive;
  if (v.isCombinable !== (discount.is_combinable ?? false)) updates.is_combinable = v.isCombinable;

  const oldOptIds = [...(discount.applicable_option_ids || [])].sort();
  const newOptIds = [...v.applicableOptions].sort();
  if (JSON.stringify(oldOptIds) !== JSON.stringify(newOptIds)) {
    updates.applicable_option_ids = v.applicableOptions;
  }

  const oldPerIds = [...(discount.applicable_period_ids || [])].sort();
  const newPerIds = [...v.applicablePeriods].sort();
  if (JSON.stringify(oldPerIds) !== JSON.stringify(newPerIds)) {
    updates.applicable_period_ids = v.applicablePeriods;
  }

  return updates;
}

/** Build the create payload for a new discount code. */
export function buildDiscountCreatePayload(v: DiscountFormValues): DiscountCodeCreate {
  return {
    description: v.description.trim(),
    code: v.code.trim().toUpperCase(),
    discount_type: v.discountType,
    discount_value: parseFloat(v.discountValue),
    currency: v.discountType === 'fixed' && v.effectiveCurrency ? v.effectiveCurrency : null,
    start_date: v.startDate || null,
    end_date: v.endDate || null,
    max_uses: parseInt(v.maxUses) || 0,
    is_combinable: v.isCombinable,
    applicable_option_ids: v.applicableOptions.length > 0 ? v.applicableOptions : undefined,
    applicable_period_ids: v.applicablePeriods.length > 0 ? v.applicablePeriods : undefined,
  };
}
