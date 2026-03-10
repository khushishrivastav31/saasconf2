/**
 * Order Summary Component
 *
 * Displays real-time pricing breakdown for all attendees and their selected booking options.
 * Supports multi-select booking options and discount codes.
 */
import type {
  PortalAttendee,
  PublicBookingOption,
  PublicBookingPeriod,
  DiscountCodeValidation,
  VatCalculation,
} from '../../../types/publicRegistration';
import { getCurrentPrice, formatPrice, applyDiscount } from '../helpers';

interface OrderSummaryProps {
  attendees: PortalAttendee[];
  bookingOptions: PublicBookingOption[];
  bookingPeriods: PublicBookingPeriod[];
  currency: string;
  discount?: DiscountCodeValidation | null;
  vatCalculation?: VatCalculation | null;
}

export default function OrderSummary({
  attendees,
  bookingOptions,
  bookingPeriods,
  currency,
  discount,
  vatCalculation,
}: OrderSummaryProps) {
  // Create a map of booking options by ID for quick lookup
  const optionsMap = new Map(bookingOptions.map((opt) => [opt.id, opt]));

  // Get current active period for discount validation
  const today = new Date().toISOString().slice(0, 10);
  const activePeriod = bookingPeriods.find((p) => p.start_date <= today && p.end_date >= today);

  // Group by booking option (like invoice format)
  const itemGroups = new Map<
    string,
    {
      optionId: string;
      optionName: string;
      quantity: number;
      unitPrice: number;
      discountPerUnit: number;
    }
  >();

  attendees.forEach((attendee) => {
    const bookingIds = attendee.booking_option_ids || [];

    bookingIds.forEach((optionId) => {
      const option = optionsMap.get(optionId);
      const priceInfo = getCurrentPrice(optionId, bookingPeriods);
      const unitPrice = priceInfo?.price || 0;

      // Apply discount if valid
      const { discountAmount } = applyDiscount(
        unitPrice,
        discount || null,
        optionId,
        activePeriod?.id
      );

      const existing = itemGroups.get(optionId);
      if (existing) {
        existing.quantity += 1;
      } else {
        itemGroups.set(optionId, {
          optionId,
          optionName: option?.name || 'Unknown option',
          quantity: 1,
          unitPrice,
          discountPerUnit: discountAmount,
        });
      }
    });
  });

  // Calculate totals
  let total = 0;
  let totalDiscountAmount = 0;
  const lineItems = Array.from(itemGroups.values()).map((item) => {
    const lineTotal = item.unitPrice * item.quantity;
    const lineDiscount = item.discountPerUnit * item.quantity;
    total += lineTotal - lineDiscount;
    totalDiscountAmount += lineDiscount;

    return {
      description: item.optionName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPerUnit: item.discountPerUnit,
      lineTotal,
      lineDiscount,
    };
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Order Summary</h2>

      {lineItems.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">No attendees added yet</p>
      ) : (
        <div>
          {/* Desktop Table Header - hidden on mobile */}
          <div className="hidden md:grid grid-cols-12 gap-2 pb-2 mb-2 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            <div className="col-span-5">Description</div>
            <div className="col-span-1 text-center">Qty</div>
            <div className="col-span-2 text-right">Unit Price</div>
            <div className="col-span-2 text-right">Discount</div>
            <div className="col-span-2 text-right">Total</div>
          </div>

          {/* Line Items */}
          <div className="space-y-3 md:space-y-2">
            {lineItems.map((item, index) => (
              <div key={index}>
                {/* Desktop Layout */}
                <div className="hidden md:grid grid-cols-12 gap-2 text-sm items-center">
                  <div className="col-span-5 font-medium text-gray-900 dark:text-gray-100">
                    {item.description}
                  </div>
                  <div className="col-span-1 text-center text-gray-700 dark:text-gray-300">
                    {item.quantity}
                  </div>
                  <div className="col-span-2 text-right text-gray-700 dark:text-gray-300">
                    {formatPrice(item.unitPrice, currency)}
                  </div>
                  <div className="col-span-2 text-right">
                    {item.discountPerUnit > 0 ? (
                      <span className="text-green-600 dark:text-green-400">
                        -{formatPrice(item.lineDiscount, currency)}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">
                        {formatPrice(0, currency)}
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 text-right font-medium text-gray-900 dark:text-gray-100">
                    {formatPrice(item.lineTotal - item.lineDiscount, currency)}
                  </div>
                </div>

                {/* Mobile Layout */}
                <div className="md:hidden border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="font-medium text-gray-900 dark:text-gray-100 flex-1">
                      {item.description}
                    </div>
                    <div className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                      × {item.quantity}
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Unit price:</span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {formatPrice(item.unitPrice, currency)}
                    </span>
                  </div>
                  {item.discountPerUnit > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">Discount:</span>
                      <span className="text-green-600 dark:text-green-400">
                        -{formatPrice(item.lineDiscount, currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-medium pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-gray-900 dark:text-gray-100">Total:</span>
                    <span className="text-gray-900 dark:text-gray-100">
                      {formatPrice(item.lineTotal - item.lineDiscount, currency)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Total Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3 space-y-2">
            {/* Subtotal (before VAT) */}
            <div className="flex justify-between items-center text-sm">
              <div className="text-gray-600 dark:text-gray-400">Subtotal</div>
              <div className="text-gray-900 dark:text-gray-100">{formatPrice(total, currency)}</div>
            </div>

            {/* VAT */}
            {vatCalculation && vatCalculation.vat_rate > 0 && (
              <div className="flex justify-between items-center text-sm">
                <div className="text-gray-600 dark:text-gray-400">
                  VAT ({vatCalculation.vat_rate}%)
                </div>
                <div className="text-gray-900 dark:text-gray-100">
                  {formatPrice(vatCalculation.vat_amount, currency)}
                </div>
              </div>
            )}

            {/* Total (including VAT) */}
            <div className="flex justify-between items-center border-t border-gray-200 dark:border-gray-700 pt-2">
              <div className="text-base font-semibold text-gray-900 dark:text-gray-100">Total</div>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {formatPrice(vatCalculation?.total || total, currency)}
              </div>
            </div>

            {/* Discount savings message */}
            {totalDiscountAmount > 0 && discount?.valid && (
              <div className="text-xs text-green-600 dark:text-green-400">
                Total savings: {formatPrice(totalDiscountAmount, currency)}{' '}
                {discount.discount_type === 'percentage' ? `(${discount.discount_value}% off)` : ''}
              </div>
            )}

            {/* VAT notes (reverse charge or OSS) */}
            {vatCalculation?.notes && (
              <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                {vatCalculation.notes}
              </div>
            )}
          </div>

          {!vatCalculation && (
            <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
              <p>* VAT will be calculated at checkout based on your billing country</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
