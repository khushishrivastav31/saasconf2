/**
 * Single Page Registration Form
 *
 * Complete registration form on a single scrollable page.
 * Integrates attendees, billing, and booking options with real-time pricing.
 */
import { useState, useEffect, useCallback, useMemo, FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { useMutation } from '@tanstack/react-query';
import publicApi from '../../config/publicApi';
import type {
  PublicConference,
  PortalAttendee,
  PortalBilling,
  PortalRegistrationResponse,
  DiscountCodeValidation,
  VatCalculation,
} from '../../types/publicRegistration';
import ConferenceHeader from './components/ConferenceHeader';
import AttendeeSection from './components/AttendeeSection';
import OrderSummary from './components/OrderSummary';
import InlineStripePayment from './components/InlineStripePayment';
import { useToast } from '../../components/Toast';
import { parseApiError } from '../../utils/apiError';
import VatNumberInput from '../../components/common/VatNumberInput';
import {
  COUNTRIES_BY_CONTINENT,
  EU_COUNTRY_CODES,
  isBankTransferCountry,
} from '../../config/countries';
import { validateEmail, validatePhone } from '../../utils/validators';
import { applyDiscount } from './helpers';
import PolicyLinks from './components/PolicyLinks';
import PolicyModal from './components/PolicyModal';

interface SinglePageFormProps {
  conference: PublicConference;
  tenantSlug: string;
  conferenceSlug: string;
}

// Helper to determine VAT requirement client-side
function determineVatRequirement(
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

export default function SinglePageForm({
  conference,
  tenantSlug,
  conferenceSlug,
}: SinglePageFormProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { executeRecaptcha } = useGoogleReCaptcha();

  const [formStartTime] = useState<number>(Date.now() / 1000);
  const [honeypot, setHoneypot] = useState('');

  // Attendees state
  const [attendees, setAttendees] = useState<PortalAttendee[]>([
    {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      job_title: '',
      department: '',
      pronouns: '',
      booking_option_ids: [],
      items: [],
    },
  ]);

  // Session selections state
  // Structure: { attendeeIndex: { optionId: { slotKey: sessionId } } }
  const [sessionSelections, setSessionSelections] = useState<
    Record<number, Record<string, Record<string, string>>>
  >({});

  // Billing state
  const [billing, setBilling] = useState<PortalBilling>({
    company_name: '',
    street: '',
    postal_code: '',
    city: '',
    country: '',
    contact_first_name: '',
    contact_last_name: '',
    contact_phone: '',
    contact_email: '',
    vat_number: '',
    payment_method: 'bank_transfer',
  });

  // Validation errors
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailValidated, setEmailValidated] = useState<boolean | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneValidated, setPhoneValidated] = useState<boolean | null>(null);
  const [vatValidated, setVatValidated] = useState<boolean | null>(null);

  // Discount code state
  const [discountValidation, setDiscountValidation] = useState<DiscountCodeValidation | null>(null);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountMessage, setDiscountMessage] = useState<string | null>(null);

  // VAT calculation state
  const [vatCalculation, setVatCalculation] = useState<VatCalculation | null>(null);

  // Terms & Conditions consent (show when T&C or Privacy Policy is enabled)
  const hasTerms = !!(
    conference.policies?.terms_and_conditions || conference.policies?.privacy_policy
  );
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  // PaymentIntent state for payment-first flow
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [creatingPaymentIntent, setCreatingPaymentIntent] = useState(false);
  const [attemptingPayment, setAttemptingPayment] = useState(false); // For credit card payment confirmation

  // Determine VAT requirement level
  const vatRequirement = useMemo(() => {
    return determineVatRequirement(
      billing.country,
      conference.country || '',
      conference.venue_type || 'in_person',
      !!billing.company_name?.trim()
    );
  }, [billing.country, billing.company_name, conference.country, conference.venue_type]);

  // Validate discount code
  const validateDiscountCode = async (code: string) => {
    if (!code || code.trim() === '') {
      setDiscountValidation(null);
      setDiscountMessage(null);
      return;
    }

    setDiscountLoading(true);
    setDiscountMessage(null);

    try {
      const response = await publicApi.get<DiscountCodeValidation>(
        `/portal/${tenantSlug}/conferences/${conferenceSlug}/validate-discount/${encodeURIComponent(code.trim())}`
      );

      setDiscountValidation(response.data);

      if (response.data.valid) {
        setDiscountMessage(`✓ Discount applied: ${response.data.description || 'Valid code'}`);
      } else {
        setDiscountMessage(`✗ ${response.data.message || 'Invalid code'}`);
      }
    } catch {
      setDiscountValidation(null);
      setDiscountMessage('✗ Error validating discount code');
    } finally {
      setDiscountLoading(false);
    }
  };

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
    const activePeriod = conference.booking_periods.find(
      (p) => p.start_date <= today && p.end_date >= today
    );

    let subtotal = 0;
    attendees.forEach((attendee) => {
      const bookingIds = attendee.booking_option_ids || [];
      bookingIds.forEach((optionId) => {
        const priceInfo = conference.booking_periods.find((p) => {
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
    conference.booking_periods,
    calculateVat,
  ]);

  // Create PaymentIntent when credit card is selected
  useEffect(() => {
    const shouldCreatePaymentIntent =
      billing.payment_method === 'credit_card' &&
      vatCalculation &&
      vatCalculation.total > 0 &&
      !paymentIntentId &&
      !creatingPaymentIntent;

    if (!shouldCreatePaymentIntent) {
      return;
    }

    const createPaymentIntent = async () => {
      setCreatingPaymentIntent(true);
      try {
        const response = await publicApi.post<{
          payment_intent_id: string;
          client_secret: string;
          publishable_key: string;
        }>(`/portal/${tenantSlug}/conferences/${conferenceSlug}/create-payment-intent`, {
          total: vatCalculation.total,
        });

        setPaymentIntentId(response.data.payment_intent_id);
        setClientSecret(response.data.client_secret);
        setPublishableKey(response.data.publishable_key);
      } catch (err) {
        console.error('Error creating PaymentIntent:', err);
        showToast('Failed to initialize payment. Please try again.', 'error');
      } finally {
        setCreatingPaymentIntent(false);
      }
    };

    createPaymentIntent();
  }, [
    billing.payment_method,
    vatCalculation,
    paymentIntentId,
    creatingPaymentIntent,
    tenantSlug,
    conferenceSlug,
    showToast,
  ]);

  // Update PaymentIntent when total changes
  useEffect(() => {
    const shouldUpdatePaymentIntent =
      billing.payment_method === 'credit_card' &&
      paymentIntentId &&
      vatCalculation &&
      vatCalculation.total > 0;

    if (!shouldUpdatePaymentIntent) {
      return;
    }

    const updatePaymentIntent = async () => {
      try {
        await publicApi.put(
          `/portal/${tenantSlug}/conferences/${conferenceSlug}/update-payment-intent/${paymentIntentId}`,
          {
            total: vatCalculation.total,
          }
        );
      } catch (err) {
        console.error('Error updating PaymentIntent:', err);
        // Don't show error toast - this is a background update
      }
    };

    updatePaymentIntent();
  }, [billing.payment_method, paymentIntentId, vatCalculation, tenantSlug, conferenceSlug]);

  // Clear PaymentIntent when switching away from credit card
  useEffect(() => {
    if (billing.payment_method !== 'credit_card' && paymentIntentId) {
      setPaymentIntentId(null);
      setClientSecret(null);
      setPublishableKey(null);
    }
  }, [billing.payment_method, paymentIntentId]);

  // Payment method availability based on Stripe status and country
  const stripeEnabled = conference.stripe_enabled ?? false;
  const bankTransferAvailable =
    !stripeEnabled ||
    !billing.country ||
    isBankTransferCountry(billing.country, conference.bank_transfer_countries);
  const creditCardAvailable = stripeEnabled;

  // Auto-switch payment method when availability changes
  useEffect(() => {
    if (!stripeEnabled && billing.payment_method === 'credit_card') {
      setBilling((prev) => ({ ...prev, payment_method: 'bank_transfer' }));
    } else if (
      stripeEnabled &&
      billing.country &&
      !isBankTransferCountry(billing.country, conference.bank_transfer_countries) &&
      billing.payment_method === 'bank_transfer'
    ) {
      setBilling((prev) => ({ ...prev, payment_method: 'credit_card' }));
    }
  }, [billing.country, stripeEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Copy first attendee data to billing
  const copyAttendeeDataToBilling = () => {
    if (attendees.length > 0) {
      const firstAttendee = attendees[0];
      setBilling({
        ...billing,
        contact_first_name: firstAttendee.first_name,
        contact_last_name: firstAttendee.last_name,
        contact_email: firstAttendee.email,
        contact_phone: firstAttendee.phone || '',
      });
      // Clear any validation errors
      setEmailError(null);
      setPhoneError(null);
      // Show success message
      showToast('Contact information copied from attendee', 'success');
    }
  };

  // Handle payment completion (after Stripe Elements confirms)
  const handlePaymentComplete = async () => {
    // Payment succeeded! Now create the registration with payment_intent_id

    // Re-validate phone (in case form state changed)
    if (!billing.contact_phone || billing.contact_phone.trim() === '') {
      showToast('Contact phone number is required', 'error');
      setAttemptingPayment(false);
      return;
    }

    // Prepare registration data
    const transformedAttendees = attendees.map((att, attendeeIndex) => {
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
      const items: Array<{
        item_type: 'booking_option';
        booking_option_id: string;
        program_session_id?: string;
      }> = [];

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

    try {
      // Get reCAPTCHA token (optional - backend validates only if configured)
      let recaptchaToken: string | null = null;

      if (executeRecaptcha) {
        try {
          recaptchaToken = await executeRecaptcha('registration_submit');
          if (!recaptchaToken) {
            console.warn('[reCAPTCHA] Failed to generate token - continuing without it');
          }
        } catch (error) {
          console.warn('[reCAPTCHA] Error generating token:', error);
        }
      } else {
        console.warn('[reCAPTCHA] Not initialized - continuing without token');
      }

      // Prepare request payload
      const requestPayload = {
        billing: {
          ...billing,
          payment_intent_id: paymentIntentId,
          vat_validated: vatValidated,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attendees: transformedAttendees as any,
        recaptcha_token: recaptchaToken,
        honeypot_field: honeypot,
        form_start_timestamp: formStartTime,
      };

      // Log the exact payload being sent for debugging
      console.log('[Registration Payload]', JSON.stringify(requestPayload, null, 2));

      // Create registration (payment already confirmed)
      const response = await publicApi.post<PortalRegistrationResponse>(
        `/portal/${tenantSlug}/conferences/${conferenceSlug}/register`,
        requestPayload
      );

      // Navigate to confirmation
      navigate('confirmation', { state: { registrationResponse: response.data } });
    } catch (error) {
      // Log detailed error for debugging
      console.error('[Registration Error]', error);
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: unknown; status?: number } };
        console.error(
          '[Registration Error Response]',
          JSON.stringify(axiosError.response?.data, null, 2)
        );
        console.error('[Registration Error Status]', axiosError.response?.status);

        // Extract Pydantic validation errors if available
        const responseData = axiosError.response?.data as { detail?: unknown };
        if (responseData?.detail && Array.isArray(responseData.detail)) {
          console.error('[Validation Errors]', responseData.detail);
          // Show which fields failed
          const fieldErrors = responseData.detail
            .map((err: { loc: string[]; msg: string }) => `${err.loc.join('.')}: ${err.msg}`)
            .join(', ');
          showToast(`Validation failed: ${fieldErrors}`, 'error');
        } else {
          showToast(
            parseApiError(error, 'Registration failed after payment. Please contact support.'),
            'error'
          );
        }
      } else {
        showToast(
          parseApiError(error, 'Registration failed after payment. Please contact support.'),
          'error'
        );
      }
      setAttemptingPayment(false);
    }
  };

  // Add attendee
  const addAttendee = () => {
    setAttendees([
      ...attendees,
      {
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        job_title: '',
        department: '',
        pronouns: '',
        booking_option_ids: [],
        items: [],
      },
    ]);
  };

  // Remove attendee
  const removeAttendee = (index: number) => {
    setAttendees(attendees.filter((_, i) => i !== index));

    // Clean up session selections - shift indices after removed attendee
    setSessionSelections((prev) => {
      const newSelections: Record<number, Record<string, Record<string, string>>> = {};
      Object.entries(prev).forEach(([idx, selections]) => {
        const numIdx = parseInt(idx, 10);
        if (numIdx < index) {
          // Keep indices before removed attendee
          newSelections[numIdx] = selections;
        } else if (numIdx > index) {
          // Shift indices after removed attendee down by 1
          newSelections[numIdx - 1] = selections;
        }
        // Skip the removed attendee's index
      });
      return newSelections;
    });
  };

  // Update attendee
  const updateAttendee = (index: number, updated: PortalAttendee) => {
    const previousAttendee = attendees[index];
    const removedOptions =
      previousAttendee?.booking_option_ids?.filter(
        (id) => !updated.booking_option_ids?.includes(id)
      ) || [];

    // Clear session selections for removed booking options
    if (removedOptions.length > 0) {
      setSessionSelections((prev) => {
        const attendeeSessions = { ...(prev[index] || {}) };
        removedOptions.forEach((optionId) => {
          delete attendeeSessions[optionId];
        });
        return { ...prev, [index]: attendeeSessions };
      });
    }

    setAttendees(attendees.map((att, i) => (i === index ? updated : att)));
  };

  // Handle session selection changes
  const handleSessionChange = (
    attendeeIndex: number,
    optionId: string,
    selections: Record<string, string>
  ) => {
    setSessionSelections((prev) => ({
      ...prev,
      [attendeeIndex]: {
        ...(prev[attendeeIndex] || {}),
        [optionId]: selections,
      },
    }));
  };

  // Submit registration
  const submitMutation = useMutation({
    mutationFn: async (data: {
      billing: PortalBilling;
      attendees: PortalAttendee[];
      recaptcha_token: string;
      honeypot_field: string;
      form_start_timestamp: number;
    }) => {
      const res = await publicApi.post<PortalRegistrationResponse>(
        `/portal/${tenantSlug}/conferences/${conferenceSlug}/register`,
        data
      );
      return res.data;
    },
    onSuccess: (response) => {
      console.log('Registration response:', response);
      // Bank transfer flow: Navigate to confirmation immediately
      navigate('confirmation', { state: { registrationResponse: response } });
    },
    onError: (error) => {
      showToast(parseApiError(error, 'Registration failed'), 'error');
    },
  });

  // Prevent Enter key from submitting form (must use explicit submit button)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && e.target instanceof HTMLElement) {
      const targetTag = e.target.tagName.toLowerCase();
      // Allow Enter in textarea, but prevent in input fields
      if (targetTag === 'input') {
        e.preventDefault();
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Prevent accidental submission from Enter key in input fields
    // Only allow submission via explicit submit button click
    const nativeEvent = e.nativeEvent as SubmitEvent;
    const submitter = nativeEvent.submitter as HTMLButtonElement | null;
    if (!submitter || submitter.type !== 'submit') {
      return;
    }

    // Validation
    if (attendees.length === 0) {
      showToast('Please add at least one attendee', 'error');
      return;
    }

    if (attendees.some((att) => !att.booking_option_ids || att.booking_option_ids.length === 0)) {
      showToast('Please select at least one booking option for each attendee', 'error');
      return;
    }

    // Validate billing contact info
    const contactEmailError = validateEmail(billing.contact_email);
    if (contactEmailError) {
      setEmailError(contactEmailError);
      showToast('Please provide a valid email address', 'error');
      return;
    }

    // Phone is required
    if (!billing.contact_phone || billing.contact_phone.trim() === '') {
      setPhoneError('Phone number is required');
      showToast('Please provide a contact phone number', 'error');
      return;
    }

    const contactPhoneError = validatePhone(billing.contact_phone);
    if (contactPhoneError) {
      setPhoneError(contactPhoneError);
      showToast(
        'Please provide a valid phone number in international format (e.g. +49123456789)',
        'error'
      );
      return;
    }

    // VAT validation
    if (vatRequirement.level === 'required') {
      if (!billing.vat_number || billing.vat_number.trim() === '') {
        showToast(
          'VAT number is required for this transaction. ' + (vatRequirement.reason || ''),
          'error'
        );
        return;
      }
      if (vatValidated === false) {
        showToast(
          'Please provide a valid VAT number. The entered VAT number could not be verified.',
          'error'
        );
        return;
      }
    }

    // Terms & Conditions consent check
    if (hasTerms && !termsAccepted) {
      showToast('Please accept the Terms and Conditions and Privacy Policy to proceed.', 'error');
      return;
    }

    // Get reCAPTCHA token
    if (!executeRecaptcha) {
      showToast('reCAPTCHA not ready. Please try again.', 'error');
      return;
    }

    const recaptchaToken = await executeRecaptcha('registration_submit');

    // Payment-first flow: For credit card, trigger Stripe payment confirmation
    // For bank transfer, create registration immediately
    if (billing.payment_method === 'credit_card') {
      // Credit card: Trigger payment confirmation (InlineStripePayment watches attemptingPayment)
      // After payment succeeds, handlePaymentComplete will create the registration
      if (!paymentIntentId) {
        showToast('Payment setup not ready. Please wait or try again.', 'error');
        return;
      }
      setAttemptingPayment(true);
    } else {
      // Bank transfer: Create registration immediately (existing behavior)
      // Transform attendees for backend (first booking option is primary, rest are items)
      const transformedAttendees = attendees.map((att, attendeeIndex) => {
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
        const items: Array<{
          item_type: 'booking_option';
          booking_option_id: string;
          program_session_id?: string;
        }> = [];

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

      // Submit
      submitMutation.mutate({
        billing,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attendees: transformedAttendees as any, // Transform PortalAttendee[] to BulkAttendeeData[]
        recaptcha_token: recaptchaToken,
        honeypot_field: honeypot,
        form_start_timestamp: formStartTime,
      });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className="min-h-screen bg-gray-50 dark:bg-gray-900 py-4 sm:py-6 md:py-8"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-4 sm:space-y-6">
        {/* Conference Header */}
        <ConferenceHeader conference={conference} />

        {/* Honeypot field (hidden) */}
        <input
          type="text"
          name="website"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          style={{ position: 'absolute', left: '-9999px' }}
          tabIndex={-1}
          autoComplete="off"
        />

        {/* Attendees Section */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Attendees</h2>
          {attendees.map((attendee, index) => (
            <AttendeeSection
              key={index}
              attendee={attendee}
              index={index}
              bookingOptions={conference.booking_options}
              bookingPeriods={conference.booking_periods}
              currency={conference.currency}
              tenantSlug={tenantSlug}
              conferenceSlug={conferenceSlug}
              sessionSelections={sessionSelections[index] || {}}
              onSessionChange={(optionId, selections) =>
                handleSessionChange(index, optionId, selections)
              }
              onChange={(updated) => updateAttendee(index, updated)}
              onRemove={attendees.length > 1 ? () => removeAttendee(index) : undefined}
              canRemove={attendees.length > 1}
            />
          ))}

          <button
            type="button"
            onClick={addAttendee}
            className="w-full py-3 px-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            + Add Another Attendee
          </button>
        </div>

        {/* Order Summary */}
        <OrderSummary
          attendees={attendees}
          bookingOptions={conference.booking_options}
          bookingPeriods={conference.booking_periods}
          currency={conference.currency}
          discount={discountValidation}
          vatCalculation={vatCalculation}
        />

        {/* Billing Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Billing Information
            </h2>
            {attendees.length > 0 && attendees[0].first_name && (
              <button
                type="button"
                onClick={copyAttendeeDataToBilling}
                className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                  />
                </svg>
                Copy from {attendees[0].first_name} {attendees[0].last_name}
              </button>
            )}
          </div>

          <div className="space-y-4">
            {/* Company Name */}
            <div>
              <label
                htmlFor="company_name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Company Name
              </label>
              <input
                id="company_name"
                type="text"
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100"
                value={billing.company_name}
                onChange={(e) => setBilling({ ...billing, company_name: e.target.value })}
              />
            </div>

            {/* Address */}
            <div>
              <label
                htmlFor="street"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Street *
              </label>
              <input
                id="street"
                type="text"
                required
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100"
                value={billing.street}
                onChange={(e) => setBilling({ ...billing, street: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="postal_code"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Postal Code *
                </label>
                <input
                  id="postal_code"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100"
                  value={billing.postal_code}
                  onChange={(e) => setBilling({ ...billing, postal_code: e.target.value })}
                />
              </div>

              <div>
                <label
                  htmlFor="city"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  City *
                </label>
                <input
                  id="city"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100"
                  value={billing.city}
                  onChange={(e) => setBilling({ ...billing, city: e.target.value })}
                />
              </div>
            </div>

            {/* Country */}
            <div>
              <label
                htmlFor="country"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Country *
              </label>
              <select
                id="country"
                required
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100"
                value={billing.country}
                onChange={(e) => {
                  setBilling({ ...billing, country: e.target.value });
                  setVatValidated(null);
                }}
              >
                <option value="">Select country...</option>
                {COUNTRIES_BY_CONTINENT.map((group) => (
                  <optgroup key={group.continent} label={group.continent}>
                    {group.countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* VAT Number */}
            <div>
              <VatNumberInput
                value={billing.vat_number || ''}
                onChange={(value) => {
                  setBilling({ ...billing, vat_number: value });
                  setVatValidated(null);
                }}
                onValidationResult={(valid) => setVatValidated(valid)}
                country={billing.country}
                required={vatRequirement.level === 'required'}
                level={vatRequirement.level}
                requirementReason={vatRequirement.reason}
                apiClient={publicApi}
                endpoint={`/portal/${tenantSlug}/conferences/${conferenceSlug}/validate-vat`}
              />
            </div>

            {/* Contact Person */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="contact_first_name"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Contact First Name *
                </label>
                <input
                  id="contact_first_name"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100"
                  value={billing.contact_first_name}
                  onChange={(e) => setBilling({ ...billing, contact_first_name: e.target.value })}
                />
              </div>

              <div>
                <label
                  htmlFor="contact_last_name"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Contact Last Name *
                </label>
                <input
                  id="contact_last_name"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100"
                  value={billing.contact_last_name}
                  onChange={(e) => setBilling({ ...billing, contact_last_name: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="contact_email"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Contact Email *
                </label>
                <div className="relative">
                  <input
                    id="contact_email"
                    type="email"
                    required
                    className={`mt-1 block w-full rounded-md shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100 ${
                      emailValidated === true
                        ? 'border-green-500 dark:border-green-600 focus:border-green-500 focus:ring-green-500'
                        : emailError
                          ? 'border-red-300 dark:border-red-600'
                          : 'border-gray-300 dark:border-gray-600'
                    }`}
                    value={billing.contact_email}
                    onChange={(e) => {
                      setBilling({ ...billing, contact_email: e.target.value });
                      setEmailError(null);
                      setEmailValidated(null);
                    }}
                    onBlur={(e) => {
                      const error = validateEmail(e.target.value);
                      if (error) {
                        setEmailError(error);
                        setEmailValidated(false);
                      } else {
                        setEmailError(null);
                        setEmailValidated(true);
                      }
                    }}
                  />
                  {/* Validation icon */}
                  {emailValidated === true && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg
                        className="h-5 w-5 text-green-500"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                  {emailValidated === false && emailError && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                {emailError && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{emailError}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="contact_phone"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Contact Phone *
                </label>
                <div className="relative">
                  <input
                    id="contact_phone"
                    type="tel"
                    required
                    placeholder="+49123456789"
                    className={`mt-1 block w-full rounded-md shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100 ${
                      phoneValidated === true
                        ? 'border-green-500 dark:border-green-600 focus:border-green-500 focus:ring-green-500'
                        : phoneError
                          ? 'border-red-300 dark:border-red-600'
                          : 'border-gray-300 dark:border-gray-600'
                    }`}
                    value={billing.contact_phone}
                    onChange={(e) => {
                      setBilling({ ...billing, contact_phone: e.target.value });
                      setPhoneError(null);
                      setPhoneValidated(null);
                    }}
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (!value) {
                        setPhoneError('Phone number is required');
                        setPhoneValidated(false);
                      } else {
                        const error = validatePhone(value);
                        if (error) {
                          setPhoneError(error);
                          setPhoneValidated(false);
                        } else {
                          setPhoneError(null);
                          setPhoneValidated(true);
                        }
                      }
                    }}
                  />
                  {/* Validation icon */}
                  {phoneValidated === true && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg
                        className="h-5 w-5 text-green-500"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                  {phoneValidated === false && phoneError && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </div>
                {phoneError && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{phoneError}</p>
                )}
                {!phoneError && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Use international format with country code (e.g. +49123456789)
                  </p>
                )}
              </div>
            </div>

            {/* Procurement Code */}
            <div>
              <label
                htmlFor="procurement_code"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Procurement / PO Code
              </label>
              <input
                id="procurement_code"
                type="text"
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100"
                value={billing.procurement_code || ''}
                onChange={(e) => setBilling({ ...billing, procurement_code: e.target.value })}
              />
            </div>

            {/* Discount Code */}
            <div>
              <label
                htmlFor="discount_code"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Discount Code
              </label>
              <div className="relative">
                <input
                  id="discount_code"
                  type="text"
                  placeholder="Enter code if applicable"
                  className={`mt-1 block w-full rounded-md shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100 ${
                    discountValidation?.valid
                      ? 'border-green-300 dark:border-green-600'
                      : discountMessage && !discountValidation?.valid
                        ? 'border-red-300 dark:border-red-600'
                        : 'border-gray-300 dark:border-gray-600'
                  }`}
                  value={billing.discount_code || ''}
                  onChange={(e) => {
                    setBilling({ ...billing, discount_code: e.target.value });
                    setDiscountMessage(null);
                  }}
                  onBlur={(e) => validateDiscountCode(e.target.value)}
                  disabled={discountLoading}
                />
                {discountLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5">
                    <svg
                      className="animate-spin h-4 w-4 text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                )}
              </div>
              {discountMessage && (
                <p
                  className={`mt-1 text-xs ${
                    discountValidation?.valid
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {discountMessage}
                </p>
              )}
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Payment Method *
              </label>
              {!creditCardAvailable ? (
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">Bank Transfer</p>
                </div>
              ) : bankTransferAvailable ? (
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="payment_method"
                      value="bank_transfer"
                      checked={billing.payment_method === 'bank_transfer'}
                      onChange={(e) =>
                        setBilling({
                          ...billing,
                          payment_method: e.target.value as 'credit_card' | 'bank_transfer',
                        })
                      }
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      Bank Transfer
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="payment_method"
                      value="credit_card"
                      checked={billing.payment_method === 'credit_card'}
                      onChange={(e) =>
                        setBilling({
                          ...billing,
                          payment_method: e.target.value as 'credit_card' | 'bank_transfer',
                        })
                      }
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600"
                    />
                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                      Credit Card
                    </span>
                  </label>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">Credit Card</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Bank transfer is not available for your billing country.
                  </p>
                </div>
              )}

              {/* Inline Stripe Payment - shows when credit card is selected */}
              {billing.payment_method === 'credit_card' && (
                <InlineStripePayment
                  clientSecret={clientSecret}
                  publishableKey={publishableKey}
                  billingName={`${billing.contact_first_name} ${billing.contact_last_name}`.trim()}
                  onSuccess={handlePaymentComplete}
                  onError={(msg) => {
                    setAttemptingPayment(false); // Reset payment attempt state
                    showToast(msg, 'error');
                  }}
                  isSubmitting={attemptingPayment}
                />
              )}
            </div>
          </div>
        </div>

        {/* Terms & Conditions / Privacy Policy Consent */}
        {hasTerms && (
          <div className="flex items-start gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <input
              type="checkbox"
              id="terms-consent"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
            />
            <label htmlFor="terms-consent" className="text-sm text-gray-700 dark:text-gray-300">
              I hereby acknowledge that I have read and understood the{' '}
              {conference.policies?.terms_and_conditions?.type === 'url' &&
              conference.policies.terms_and_conditions.url ? (
                <a
                  href={conference.policies.terms_and_conditions.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700 underline"
                >
                  Terms and Conditions
                </a>
              ) : conference.policies?.terms_and_conditions?.type === 'content' &&
                conference.policies.terms_and_conditions.content ? (
                <button
                  type="button"
                  onClick={() => setTermsModalOpen(true)}
                  className="text-primary-600 hover:text-primary-700 underline font-medium"
                >
                  Terms and Conditions
                </button>
              ) : (
                <span className="text-primary-600 font-medium">Terms and Conditions</span>
              )}{' '}
              and{' '}
              {conference.policies?.privacy_policy?.type === 'url' &&
              conference.policies.privacy_policy.url ? (
                <a
                  href={conference.policies.privacy_policy.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700 underline"
                >
                  Privacy Policy
                </a>
              ) : conference.policies?.privacy_policy?.type === 'content' &&
                conference.policies.privacy_policy.content ? (
                <button
                  type="button"
                  onClick={() => setPrivacyModalOpen(true)}
                  className="text-primary-600 hover:text-primary-700 underline font-medium"
                >
                  Privacy Policy
                </button>
              ) : (
                <span className="text-primary-600 font-medium">Privacy Policy</span>
              )}{' '}
              and I agree to all of the terms.
              <span className="text-red-500 ml-0.5">*</span>
            </label>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitMutation.isPending || attemptingPayment}
            className="w-full sm:w-auto px-6 py-3 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {attemptingPayment
              ? 'Processing Payment...'
              : submitMutation.isPending
                ? 'Submitting...'
                : 'Submit Registration'}
          </button>
        </div>

        {/* reCAPTCHA notice */}
        <p className="text-xs text-center text-gray-500 dark:text-gray-400">
          This site is protected by reCAPTCHA and the Google{' '}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:text-primary-700"
          >
            Privacy Policy
          </a>{' '}
          and{' '}
          <a
            href="https://policies.google.com/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:text-primary-700"
          >
            Terms of Service
          </a>{' '}
          apply.
        </p>

        {/* Policy links */}
        <PolicyLinks policies={conference.policies} className="mt-2" />
      </div>

      {/* Terms & Conditions Modal */}
      {termsModalOpen && conference.policies?.terms_and_conditions?.content && (
        <PolicyModal
          title="Terms and Conditions"
          content={conference.policies.terms_and_conditions.content}
          onClose={() => setTermsModalOpen(false)}
        />
      )}

      {/* Privacy Policy Modal */}
      {privacyModalOpen && conference.policies?.privacy_policy?.content && (
        <PolicyModal
          title="Privacy Policy"
          content={conference.policies.privacy_policy.content}
          onClose={() => setPrivacyModalOpen(false)}
        />
      )}
    </form>
  );
}
