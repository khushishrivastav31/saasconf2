import { useState, useEffect, useCallback, useMemo } from 'react';
import publicApi from '../../../config/publicApi';
import { EU_COUNTRY_CODES } from '../../../config/countries';
import { applyDiscount } from '../helpers';
import type {
  PortalAttendee,
  PortalBilling,
  PublicBookingPeriod,
  DiscountCodeValidation,
  VatCalculation,
} from '../../../types/publicRegistration';

/**
 * Determine VAT requirement level client-side based on country, conference, and billing info.
 */
export function determineVatRequirement(
  country: string,
  conferenceCountry: string,
  conferenceVenue: string,
  hasCompanyName: boolean
): { level: 'required' | 'recommended' | 'optional'; reason?: string } {
  if (!country || !conferenceCountry) {
    return { level: 'optional' };
  }

  const isEU = EU_COUNTRY_CODES.has(country.toUpperCase());
  const isDomestic = country.toUpperCase() === conferenceCountry.toUpperCase();
  const isVirtual = conferenceVenue === 'virtual' || conferenceVenue === 'hybrid';

  // REQUIRED: Virtual/hybrid + EU (non-domestic) + has company name (B2B indicator)
  if (isVirtual && isEU && !isDomestic && hasCompanyName) {
    return {
      level: 'required',
      reason:
        'VAT number is required for reverse charge on virtual services to EU businesses (Article 196, VAT Directive).',
    };
  }

  // RECOMMENDED: B2B (has company name) in domestic or EU
  if (hasCompanyName && (isDomestic || isEU)) {
    return {
      level: 'recommended',
      reason: 'VAT number is recommended for B2B transactions to enable VAT reclaim.',
    };
  }

  return { level: 'optional' };
}

interface UseVatCalculationParams {
  tenantSlug: string;
  conferenceSlug: string;
  billing: PortalBilling;
  attendees: PortalAttendee[];
  discountValidation: DiscountCodeValidation | null;
  bookingPeriods: PublicBookingPeriod[];
  conferenceCountry: string;
  conferenceVenueType: string;
}

interface UseVatCalculationReturn {
  vatCalculation: VatCalculation | null;
  vatRequirement: { level: 'required' | 'recommended' | 'optional'; reason?: string };
  currentSubtotal: number;
  paymentAmount: number;
}

export function useVatCalculation({
  tenantSlug,
  conferenceSlug,
  billing,
  attendees,
  discountValidation,
  bookingPeriods,
  conferenceCountry,
  conferenceVenueType,
}: UseVatCalculationParams): UseVatCalculationReturn {
  const [vatCalculation, setVatCalculation] = useState<VatCalculation | null>(null);

  // Determine VAT requirement level
  const vatRequirement = useMemo(() => {
    return determineVatRequirement(
      billing.country,
      conferenceCountry,
      conferenceVenueType,
      !!billing.company_name?.trim()
    );
  }, [billing.country, billing.company_name, conferenceCountry, conferenceVenueType]);

  // Calculate VAT based on country and VAT number
  const calculateVat = useCallback(
    async (subtotal: number, country: string, vatNumber: string | null) => {
      if (!country || subtotal <= 0) {
        setVatCalculation(null);
        return;
      }

      try {
        const response = await publicApi.post<VatCalculation>(
          `/portal/${tenantSlug}/conferences/${conferenceSlug}/calculate-vat`,
          {
            country,
            vat_number: vatNumber,
            subtotal,
          }
        );

        setVatCalculation(response.data);
      } catch (err) {
        console.error('Error calculating VAT:', err);
        setVatCalculation(null);
      }
    },
    [tenantSlug, conferenceSlug]
  );

  // Recalculate VAT whenever billing country, VAT number, or subtotal changes
  useEffect(() => {
    // Calculate subtotal from attendees using SAME logic as OrderSummary
    const today = new Date().toISOString().slice(0, 10);
    const activePeriod = bookingPeriods.find((p) => p.start_date <= today && p.end_date >= today);

    let subtotal = 0;
    attendees.forEach((attendee) => {
      const bookingIds = attendee.booking_option_ids || [];
      bookingIds.forEach((optionId) => {
        const priceInfo = bookingPeriods.find((p) => {
          return p.start_date <= today && p.end_date >= today && p.prices[optionId];
        });
        const price = priceInfo?.prices[optionId] || 0;

        // Apply discount using helper that checks option/period restrictions
        const { discountedPrice } = applyDiscount(
          price,
          discountValidation || null,
          optionId,
          activePeriod?.id
        );
        subtotal += discountedPrice;
      });
    });

    // Calculate VAT
    calculateVat(subtotal, billing.country, billing.vat_number || null);
  }, [
    billing.country,
    billing.vat_number,
    attendees,
    discountValidation,
    bookingPeriods,
    calculateVat,
  ]);

  // Calculate subtotal for PaymentIntent (same logic as VAT calculation effect)
  const currentSubtotal = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const activePeriod = bookingPeriods.find((p) => p.start_date <= today && p.end_date >= today);

    let total = 0;
    attendees.forEach((attendee) => {
      const bookingIds = attendee.booking_option_ids || [];
      bookingIds.forEach((optionId) => {
        const priceInfo = bookingPeriods.find((p) => {
          return p.start_date <= today && p.end_date >= today && p.prices[optionId];
        });
        const price = priceInfo?.prices[optionId] || 0;
        const { discountedPrice } = applyDiscount(
          price,
          discountValidation || null,
          optionId,
          activePeriod?.id
        );
        total += discountedPrice;
      });
    });
    return total;
  }, [attendees, bookingPeriods, discountValidation]);

  // Determine the amount for PaymentIntent: use VAT total if available, otherwise subtotal
  const paymentAmount = vatCalculation ? vatCalculation.total : currentSubtotal;

  return {
    vatCalculation,
    vatRequirement,
    currentSubtotal,
    paymentAmount,
  };
}
