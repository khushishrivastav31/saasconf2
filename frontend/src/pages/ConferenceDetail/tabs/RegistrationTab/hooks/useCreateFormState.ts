import { useState, useMemo, useEffect, useCallback } from 'react';
import api from '../../../../../config/api';
import type {
  UnifiedAttendeeData,
  BillingProfileCreate,
  RegistrationItemCreate,
  BookingOption,
  BookingPeriod,
  DiscountCodeValidation,
  VatCalculation,
} from '../../../../../types';
import type {
  PortalAttendee,
  PublicBookingPeriod,
  PublicBookingOption,
} from '../../../../../types/publicRegistration';
import { emptyBilling, emptyUnifiedAttendee } from '../helpers';

export function useCreateFormState(
  conferenceId: string,
  options: BookingOption[],
  periods: BookingPeriod[]
) {
  // Create form state (unified -- always an array of attendees)
  const [attendees, setAttendees] = useState<UnifiedAttendeeData[]>([{ ...emptyUnifiedAttendee }]);
  const [attendeeOptionIds, setAttendeeOptionIds] = useState<string[][]>([[]]);
  // Map: optionId -> session selections for that option
  const [attendeeSessionSelections, setAttendeeSessionSelections] = useState<
    Record<string, Record<string, string>>[]
  >([{}]);
  const [billing, setBilling] = useState<BillingProfileCreate>({ ...emptyBilling });

  // Discount code validation state
  const [discountValidation, setDiscountValidation] = useState<DiscountCodeValidation | null>(null);

  // VAT calculation state
  const [vatCalculation, setVatCalculation] = useState<VatCalculation | null>(null);

  // Discount validation hook - debounced
  useEffect(() => {
    const validateDiscount = async (code: string) => {
      try {
        const response = await api.get<DiscountCodeValidation>(
          `/conferences/${conferenceId}/registrations/validate-discount/${encodeURIComponent(code.trim())}`
        );
        setDiscountValidation(response.data);
      } catch {
        setDiscountValidation({
          valid: false,
          message: 'Error validating code',
        } as DiscountCodeValidation);
      }
    };

    const timer = setTimeout(() => {
      if (billing.discount_code && billing.discount_code.trim()) {
        validateDiscount(billing.discount_code);
      } else {
        setDiscountValidation(null);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [billing.discount_code, conferenceId]);

  // VAT calculation hook
  useEffect(() => {
    const calculateVat = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const activePeriod = periods.find(
        (p) => p.is_active && p.start_date <= today && p.end_date >= today
      );

      if (!activePeriod) {
        setVatCalculation(null);
        return;
      }

      let subtotal = 0;
      attendees.forEach((_, idx) => {
        const selectedOptions = attendeeOptionIds[idx] || [];
        selectedOptions.forEach((optionId) => {
          const price = Number(activePeriod.prices?.[optionId] || 0);

          if (discountValidation?.valid) {
            const applies =
              (!discountValidation.applicable_option_ids ||
                discountValidation.applicable_option_ids.length === 0 ||
                discountValidation.applicable_option_ids.includes(optionId)) &&
              (!discountValidation.applicable_period_ids ||
                discountValidation.applicable_period_ids.length === 0 ||
                discountValidation.applicable_period_ids.includes(activePeriod.id));

            if (applies) {
              const discountValue = discountValidation.discount_value || 0;
              const discountAmount =
                discountValidation.discount_type === 'percentage'
                  ? (price * discountValue) / 100
                  : Math.min(discountValue, price);
              subtotal += price - discountAmount;
            } else {
              subtotal += price;
            }
          } else {
            subtotal += price;
          }
        });
      });

      if (!billing.country || subtotal === 0) {
        setVatCalculation(null);
        return;
      }

      try {
        const response = await api.post<VatCalculation>(
          `/conferences/${conferenceId}/registrations/calculate-vat`,
          {
            country: billing.country,
            vat_number: billing.vat_number || null,
            subtotal,
          }
        );
        setVatCalculation(response.data);
      } catch (err) {
        console.error('VAT calculation failed:', err);
        setVatCalculation(null);
      }
    };

    const timer = setTimeout(() => {
      calculateVat();
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    billing.country,
    billing.vat_number,
    attendeeOptionIds,
    discountValidation,
    periods,
    attendees.length,
    conferenceId,
  ]);

  // Convert admin types to public types for OrderSummary component
  const publicBookingOptions: PublicBookingOption[] = useMemo(() => {
    return options.map((opt) => ({
      id: opt.id,
      name: opt.name,
      description: opt.description || '',
      price: 0, // Price comes from period
      capacity: null,
      current_registrations: 0,
      is_sold_out: false,
      conference_day_id: opt.conference_day_id,
    }));
  }, [options]);

  const publicBookingPeriods: PublicBookingPeriod[] = useMemo(() => {
    return periods.map((period) => ({
      id: period.id,
      name: period.name,
      start_date: period.start_date,
      end_date: period.end_date,
      prices: period.prices || {},
      sort_order: period.sort_order,
    }));
  }, [periods]);

  const portalAttendees: PortalAttendee[] = useMemo(() => {
    return attendees.map((att, idx) => ({
      first_name: att.first_name,
      last_name: att.last_name,
      email: att.email,
      phone: att.phone || '',
      job_title: att.job_title || '',
      department: att.department || '',
      pronouns: att.pronouns || '',
      booking_option_ids: attendeeOptionIds[idx] || [],
      items: [],
    }));
  }, [attendees, attendeeOptionIds]);

  const resetCreateForm = useCallback(() => {
    setAttendees([{ ...emptyUnifiedAttendee }]);
    setAttendeeOptionIds([[]]);
    setAttendeeSessionSelections([{}]);
    setBilling({ ...emptyBilling });
  }, []);

  const buildCreatePayload = useCallback(() => {
    const mergedAttendees: UnifiedAttendeeData[] = attendees.map((a, idx) => {
      const ids = attendeeOptionIds[idx] || [];
      const sessionMap = attendeeSessionSelections[idx] || {};

      // Extract main session ID (for first booking option)
      const mainSessionId =
        ids[0] && sessionMap[ids[0]] ? Object.values(sessionMap[ids[0]]).find(Boolean) : undefined;

      // Create items ONLY for add-ons (skip index 0)
      const items: RegistrationItemCreate[] = [];

      ids.forEach((optionId, optionIdx) => {
        // FIXED: Only create RegistrationItems for ADD-ONS (idx > 0), not main booking
        if (optionIdx > 0) {
          const sessionSelections = sessionMap[optionId];
          const sessionId = sessionSelections
            ? Object.values(sessionSelections).find(Boolean)
            : undefined;

          items.push({
            item_type: 'booking_option' as const,
            booking_option_id: optionId,
            program_session_id: sessionId || undefined,
          });
        }
      });

      return {
        ...a,
        booking_option_id: ids[0] || '',
        main_session_id: mainSessionId, // NEW: Pass main session directly
        items: items.length ? items : undefined,
      };
    });

    const validAttendees = mergedAttendees.filter(
      (a) => a.first_name && a.last_name && a.email && a.booking_option_id
    );

    return { billing, attendees: validAttendees };
  }, [attendees, attendeeOptionIds, attendeeSessionSelections, billing]);

  return {
    attendees,
    setAttendees,
    attendeeOptionIds,
    setAttendeeOptionIds,
    attendeeSessionSelections,
    setAttendeeSessionSelections,
    billing,
    setBilling,
    discountValidation,
    vatCalculation,
    publicBookingOptions,
    publicBookingPeriods,
    portalAttendees,
    resetCreateForm,
    buildCreatePayload,
  };
}
