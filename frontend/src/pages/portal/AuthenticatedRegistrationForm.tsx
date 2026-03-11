/**
 * Authenticated Registration Form Component
 *
 * Full registration form for logged-in portal users with alumni discount support.
 * Composes existing components: AttendeeSection, OrderSummary, InlineStripePayment, BillingFields
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { loadStripe } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';
import portalApi from '../../config/portalApi';
import { useApplicantAuth } from '../../hooks/useApplicantAuth';
import { usePaymentIntent } from '../../hooks/usePaymentIntent';
import AttendeeSection from '../PublicRegistration/components/AttendeeSection';
import OrderSummary from '../PublicRegistration/components/OrderSummary';
import InlineStripePayment from '../PublicRegistration/components/InlineStripePayment';
import PolicyLinks from '../PublicRegistration/components/PolicyLinks';
import PolicyModal from '../PublicRegistration/components/PolicyModal';
import BillingFields from '../ConferenceDetail/tabs/RegistrationTab/BillingFields';
import { useToast } from '../../components/Toast';
import { parseApiError } from '../../utils/apiError';
import type {
  PortalAttendee,
  PublicConference,
  DiscountCodeValidation,
  VatCalculation,
  PortalRegistrationResponse,
} from '../../types/publicRegistration';
import type { BillingProfileCreate } from '../../types';
import { isBankTransferCountry } from '../../config/countries';

interface AlumniCheckResponse {
  is_alumni: boolean;
  has_discount: boolean;
  discount_id: string | null;
  alumni_conferences: Array<{
    conference_id: string;
    conference_name: string;
    conference_abbreviation: string;
  }>;
  warning_message: string | null;
}

interface AuthenticatedRegistrationFormProps {
  conferenceId: string;
  alumniInfo: AlumniCheckResponse | null;
}

export default function AuthenticatedRegistrationForm({
  conferenceId,
  alumniInfo,
}: AuthenticatedRegistrationFormProps) {
  const navigate = useNavigate();
  const { companySlug } = useParams<{ companySlug: string }>();
  const { applicant } = useApplicantAuth();
  const { showToast } = useToast();

  // Fetch conference details
  const { data: conference, isLoading: conferenceLoading } = useQuery<PublicConference>({
    queryKey: ['portal', 'conference', conferenceId, 'public-details'],
    queryFn: async () => {
      const response = await portalApi.get<PublicConference>(
        `/portal/conferences/${conferenceId}/public-details`
      );
      return response.data;
    },
    enabled: !!conferenceId,
  });

  // Attendees state - pre-fill first attendee with user info
  const [attendees, setAttendees] = useState<PortalAttendee[]>([
    {
      first_name: applicant?.first_name || '',
      last_name: applicant?.last_name || '',
      email: applicant?.email || '',
      phone: applicant?.phone || '',
      job_title: '',
      department: '',
      pronouns: '',
      booking_option_ids: [],
      items: [],
    },
  ]);

  // Session selections state
  const [sessionSelections, setSessionSelections] = useState<
    Record<number, Record<string, Record<string, string>>>
  >({});

  // Billing state - pre-filled from user profile
  const [billing, setBilling] = useState<BillingProfileCreate>({
    company_name: applicant?.company || null,
    street: '',
    postal_code: '',
    city: '',
    country: '',
    contact_first_name: applicant?.first_name || '',
    contact_last_name: applicant?.last_name || '',
    contact_email: applicant?.email || '',
    contact_phone: applicant?.phone || '',
    vat_number: null,
    vat_validated: null,
    payment_method: 'bank_transfer',
    discount_code: null,
    procurement_code: null,
  });

  // VAT calculation state
  const [vatCalculation, setVatCalculation] = useState<VatCalculation | null>(null);

  // Discount validation state (for ALUMNI and manual discount codes)
  const [discountValidation, setDiscountValidation] = useState<DiscountCodeValidation | null>(null);
  const [discountMessage, setDiscountMessage] = useState<string | null>(null);
  const [discountLoading, setDiscountLoading] = useState(false);

  // Payment attempt state
  const [attemptingPayment, setAttemptingPayment] = useState(false);

  // Terms & Conditions consent (show when T&C or Privacy Policy is enabled)
  const hasTerms = !!(
    conference?.policies?.terms_and_conditions || conference?.policies?.privacy_policy
  );
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  // Auto-fetch ALUMNI discount validation on mount if eligible
  useEffect(() => {
    if (alumniInfo?.has_discount && conferenceId) {
      fetchAlumniDiscount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alumniInfo?.has_discount, conferenceId]);

  const fetchAlumniDiscount = async () => {
    if (!conferenceId) return;

    try {
      const response = await portalApi.get<DiscountCodeValidation>(
        `/portal/conferences/${conferenceId}/validate-discount/ALUMNI`
      );
      setDiscountValidation(response.data);
    } catch (error) {
      console.error('Failed to fetch ALUMNI discount:', error);
    }
  };

  // Validate a manually-entered discount code (mirrors public form behaviour)
  const validateDiscountCode = useCallback(
    async (code: string) => {
      if (!code || code.trim() === '' || !conferenceId) {
        // If alumni discount is active, keep it; otherwise clear
        if (!alumniInfo?.has_discount) {
          setDiscountValidation(null);
        }
        setDiscountMessage(null);
        return;
      }

      setDiscountLoading(true);
      setDiscountMessage(null);

      try {
        const response = await portalApi.get<DiscountCodeValidation>(
          `/portal/conferences/${conferenceId}/validate-discount/${encodeURIComponent(code.trim())}`
        );

        if (response.data.valid) {
          setDiscountValidation(response.data);
          setDiscountMessage(
            `\u2713 Discount applied: ${response.data.description || 'Valid code'}`
          );
        } else {
          // Keep alumni discount if present, only clear manual
          if (!alumniInfo?.has_discount) {
            setDiscountValidation(null);
          }
          setDiscountMessage(`\u2717 ${response.data.message || 'Invalid discount code'}`);
        }
      } catch {
        if (!alumniInfo?.has_discount) {
          setDiscountValidation(null);
        }
        setDiscountMessage('\u2717 Error validating discount code');
      } finally {
        setDiscountLoading(false);
      }
    },
    [conferenceId, alumniInfo?.has_discount]
  );

  // Calculate VAT based on billing info
  const calculateVat = useCallback(
    async (subtotal: number, country: string, vatNumber: string | null) => {
      if (!country || subtotal <= 0 || !conference) {
        setVatCalculation(null);
        return;
      }

      try {
        const response = await portalApi.post<VatCalculation>(
          `/portal/conferences/${conferenceId}/calculate-vat`,
          {
            country,
            vat_number: vatNumber,
            subtotal,
          }
        );
        setVatCalculation(response.data);
      } catch (error) {
        console.error('VAT calculation error:', error);
        setVatCalculation(null);
      }
    },
    [conferenceId, conference]
  );

  // Calculate subtotal for VAT and payment
  const subtotal = useMemo(() => {
    if (!conference) return 0;

    let total = 0;
    attendees.forEach((att) => {
      att.booking_option_ids?.forEach((optionId) => {
        const option = conference.booking_options.find((opt) => opt.id === optionId);
        if (option) {
          total += option.price;
        }
      });
    });

    // Apply alumni discount
    if (discountValidation?.valid && discountValidation.discount_type === 'percentage') {
      total = total * (1 - (discountValidation.discount_value || 0) / 100);
    }

    return total;
  }, [attendees, conference, discountValidation]);

  // Calculate total with VAT
  const totalWithVat = useMemo(() => {
    return subtotal + (vatCalculation?.vat_amount || 0);
  }, [subtotal, vatCalculation]);

  // Trigger VAT calculation when billing country/VAT number changes
  useEffect(() => {
    if (!conference) return;
    calculateVat(subtotal, billing.country, billing.vat_number || null);
  }, [billing.country, billing.vat_number, subtotal, conference, calculateVat]);

  // Eagerly load Stripe when conference data is available (not when user selects credit card)
  const stripePromiseRef = useRef<Promise<Stripe | null> | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  useEffect(() => {
    if (
      conference?.stripe_enabled &&
      conference?.stripe_publishable_key &&
      !stripePromiseRef.current
    ) {
      const promise = loadStripe(conference.stripe_publishable_key, { locale: 'en' });
      stripePromiseRef.current = promise;
      setStripePromise(promise);
    }
  }, [conference?.stripe_enabled, conference?.stripe_publishable_key]);

  // Payment method availability based on Stripe status and country
  const stripeEnabled = conference?.stripe_enabled ?? false;
  const bankTransferAvailable =
    !stripeEnabled ||
    !billing.country ||
    isBankTransferCountry(billing.country, conference?.bank_transfer_countries);
  const creditCardAvailable = stripeEnabled;

  // Auto-switch payment method when availability changes
  useEffect(() => {
    if (!stripeEnabled && billing.payment_method === 'credit_card') {
      setBilling((prev) => ({ ...prev, payment_method: 'bank_transfer' }));
    } else if (
      stripeEnabled &&
      billing.country &&
      !isBankTransferCountry(billing.country, conference?.bank_transfer_countries) &&
      billing.payment_method === 'bank_transfer'
    ) {
      setBilling((prev) => ({ ...prev, payment_method: 'credit_card' }));
    }
  }, [billing.country, stripeEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Use payment intent hook for credit card payments
  const { paymentIntentId, clientSecret, publishableKey } = usePaymentIntent({
    total: totalWithVat,
    currency: conference?.currency || 'EUR',
    enabled: billing.payment_method === 'credit_card',
    createEndpoint: `/portal/conferences/${conferenceId}/create-payment-intent`,
    updateEndpoint: (id) => `/portal/conferences/${conferenceId}/update-payment-intent/${id}`,
    apiClient: portalApi,
  });

  // Registration mutation
  const registrationMutation = useMutation<
    PortalRegistrationResponse,
    Error,
    {
      billing: BillingProfileCreate;
      attendees: PortalAttendee[];
      payment_intent_id?: string;
    }
  >({
    mutationFn: async (payload) => {
      const response = await portalApi.post<PortalRegistrationResponse>(
        `/portal/conferences/${conferenceId}/register`,
        {
          billing: {
            ...payload.billing,
            payment_intent_id: payload.payment_intent_id,
          },
          attendees: payload.attendees,
          discount_code: payload.billing.discount_code || undefined,
        }
      );
      return response.data;
    },
    onSuccess: () => {
      showToast('Registration successful!', 'success');
      // Navigate to confirmation or success page
      navigate(`/${companySlug}/portal/my-registrations`);
    },
    onError: (error) => {
      showToast(parseApiError(error), 'error');
      setAttemptingPayment(false);
    },
  });

  // Single attendee handler (authenticated users can only register themselves)
  const updateAttendee = (index: number, updated: PortalAttendee) => {
    const newAttendees = [...attendees];
    newAttendees[index] = updated;
    setAttendees(newAttendees);
  };

  // Session selection handlers
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

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (attendees.length === 0) {
      showToast('Please add at least one attendee', 'error');
      return;
    }

    // Validate attendee required fields with specific error messages
    for (let i = 0; i < attendees.length; i++) {
      const att = attendees[i];
      const missingAttendeeFields: string[] = [];
      if (!att.first_name?.trim()) missingAttendeeFields.push('First Name');
      if (!att.last_name?.trim()) missingAttendeeFields.push('Last Name');
      if (!att.email?.trim()) missingAttendeeFields.push('Email');

      if (missingAttendeeFields.length > 0) {
        const fieldList = missingAttendeeFields.join(', ');
        showToast(`Attendee ${i + 1}: Please fill in ${fieldList}`, 'error');
        return;
      }
    }

    if (attendees.some((att) => att.booking_option_ids.length === 0)) {
      showToast('Please select at least one booking option for each attendee', 'error');
      return;
    }

    // Validate all required billing fields with specific error messages
    const missingBillingFields: string[] = [];
    if (!billing.street?.trim()) missingBillingFields.push('Street Address');
    if (!billing.postal_code?.trim()) missingBillingFields.push('Postal Code');
    if (!billing.city?.trim()) missingBillingFields.push('City');
    if (!billing.country?.trim()) missingBillingFields.push('Country');
    if (!billing.contact_first_name?.trim()) missingBillingFields.push('Contact First Name');
    if (!billing.contact_last_name?.trim()) missingBillingFields.push('Contact Last Name');
    if (!billing.contact_email?.trim()) missingBillingFields.push('Contact Email');
    if (!billing.contact_phone?.trim()) missingBillingFields.push('Contact Phone');

    if (missingBillingFields.length > 0) {
      const fieldList = missingBillingFields.join(', ');
      showToast(`Please fill in the following required fields: ${fieldList}`, 'error');
      return;
    }

    // Terms & Conditions consent check
    if (hasTerms && !termsAccepted) {
      showToast('Please accept the Terms and Conditions and Privacy Policy to proceed.', 'error');
      return;
    }

    // Transform attendees for backend (same as public registration)
    // First booking option is primary, rest are items with their sessions
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

    if (billing.payment_method === 'credit_card') {
      // For credit card, trigger Stripe payment confirmation
      setAttemptingPayment(true);
      // Payment will be confirmed by InlineStripePayment component
    } else {
      // For bank transfer, submit directly
      registrationMutation.mutate({
        billing,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        attendees: transformedAttendees as any,
      });
    }
  };

  // Payment success handler (for credit card)
  const handlePaymentSuccess = () => {
    // Transform attendees for backend (same transformation as bank transfer)
    const transformedAttendees = attendees.map((att, attendeeIndex) => {
      const bookingIds = att.booking_option_ids || [];
      const [primaryId, ...additionalIds] = bookingIds;

      const attendeeSessions = sessionSelections[attendeeIndex] || {};

      let mainSessionId: string | null = null;
      if (primaryId && attendeeSessions[primaryId]) {
        const primarySlots = attendeeSessions[primaryId];
        const sessionId = Object.values(primarySlots).find((id) => id);
        if (sessionId) {
          mainSessionId = sessionId;
        }
      }

      const items: Array<{
        item_type: 'booking_option';
        booking_option_id: string;
        program_session_id?: string;
      }> = [];

      additionalIds.forEach((id) => {
        const hasSession = attendeeSessions[id];
        if (!hasSession) {
          items.push({
            item_type: 'booking_option' as const,
            booking_option_id: id,
          });
        }
      });

      Object.entries(attendeeSessions).forEach(([optionId, slotSelections]) => {
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

    // Payment confirmed, now submit registration
    registrationMutation.mutate({
      billing,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attendees: transformedAttendees as any,
      payment_intent_id: paymentIntentId || undefined,
    });
  };

  // Payment error handler
  const handlePaymentError = (message: string) => {
    showToast(message, 'error');
    setAttemptingPayment(false);
  };

  if (conferenceLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!conference) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">Conference not found</p>
      </div>
    );
  }

  // Check if discount code field should be shown
  // Show if: NOT alumni OR (alumni AND discount is_combinable)
  // Hide if: alumni AND discount NOT is_combinable
  const showDiscountField =
    !alumniInfo?.has_discount ||
    (alumniInfo?.has_discount && discountValidation?.is_combinable === true);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Alumni Banner */}
      {alumniInfo?.is_alumni && alumniInfo?.has_discount && (
        <div className="bg-green-50 dark:bg-green-900/30 border-l-4 border-green-500 p-4 rounded-md">
          <div className="flex">
            <div className="shrink-0">
              <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="font-semibold text-green-800 dark:text-green-200">
                Alumni discount automatically applied!
              </p>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                You attended:{' '}
                {alumniInfo.alumni_conferences.map((c) => c.conference_name).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Attendee Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Your Registration
        </h2>
        {attendees.map((attendee, index) => (
          <AttendeeSection
            key={index}
            attendee={attendee}
            index={index}
            bookingOptions={conference.booking_options}
            bookingPeriods={conference.booking_periods}
            currency={conference.currency}
            tenantSlug={companySlug || ''}
            conferenceSlug={conference.abbreviation}
            sessionSelections={sessionSelections[index] || {}}
            onSessionChange={(optionId, selections) =>
              handleSessionChange(index, optionId, selections)
            }
            onChange={(updated) => updateAttendee(index, updated)}
            canRemove={false}
          />
        ))}
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
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Billing Information
        </h2>
        <div className="space-y-4">
          <BillingFields
            data={billing}
            onChange={setBilling}
            conference={conference}
            initialValues={{
              contact_first_name: applicant?.first_name || '',
              contact_last_name: applicant?.last_name || '',
              contact_email: applicant?.email || '',
              contact_phone: applicant?.phone || '',
              company_name: applicant?.company || null,
            }}
            readOnlyFields={['contact_email']}
            hidePaymentMethod={true}
            hideDiscountCode={true}
            vatApiClient={portalApi}
            vatEndpoint={`/portal/conferences/${conferenceId}/validate-vat`}
          />

          {/* Conditional Discount Code Field */}
          {showDiscountField && (
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
                    discountValidation?.valid && discountMessage
                      ? 'border-green-300 dark:border-green-600'
                      : discountMessage && !discountValidation?.valid
                        ? 'border-red-300 dark:border-red-600'
                        : 'border-gray-300 dark:border-gray-600'
                  }`}
                  value={billing.discount_code || ''}
                  onChange={(e) => {
                    setBilling({ ...billing, discount_code: e.target.value });
                    if (!e.target.value.trim()) {
                      setDiscountMessage(null);
                      if (!alumniInfo?.has_discount) {
                        setDiscountValidation(null);
                      }
                    }
                  }}
                  onBlur={(e) => validateDiscountCode(e.target.value)}
                />
                {discountLoading && (
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    <svg
                      className="animate-spin h-4 w-4 text-gray-400"
                      viewBox="0 0 24 24"
                      fill="none"
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
          )}

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
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Credit Card</span>
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
                stripePromise={stripePromise}
                billingName={`${billing.contact_first_name} ${billing.contact_last_name}`.trim()}
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
                isSubmitting={attemptingPayment}
              />
            )}
          </div>
        </div>
      </div>

      {/* Terms & Conditions / Privacy Policy Consent */}
      {hasTerms && conference && (
        <div className="flex items-start gap-3 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <input
            type="checkbox"
            id="terms-consent"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
          />
          <label htmlFor="terms-consent" className="text-sm text-gray-700 dark:text-gray-300">
            I hereby acknowledge that I have read and understood the{' '}
            {conference.policies?.terms_and_conditions?.type === 'url' &&
            conference.policies.terms_and_conditions.url ? (
              <a
                href={conference.policies.terms_and_conditions.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline"
              >
                Terms and Conditions
              </a>
            ) : conference.policies?.terms_and_conditions?.type === 'content' &&
              conference.policies.terms_and_conditions.content ? (
              <button
                type="button"
                onClick={() => setTermsModalOpen(true)}
                className="text-blue-600 hover:text-blue-700 underline font-medium"
              >
                Terms and Conditions
              </button>
            ) : (
              <span className="text-blue-600 font-medium">Terms and Conditions</span>
            )}{' '}
            and{' '}
            {conference.policies?.privacy_policy?.type === 'url' &&
            conference.policies.privacy_policy.url ? (
              <a
                href={conference.policies.privacy_policy.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline"
              >
                Privacy Policy
              </a>
            ) : conference.policies?.privacy_policy?.type === 'content' &&
              conference.policies.privacy_policy.content ? (
              <button
                type="button"
                onClick={() => setPrivacyModalOpen(true)}
                className="text-blue-600 hover:text-blue-700 underline font-medium"
              >
                Privacy Policy
              </button>
            ) : (
              <span className="text-blue-600 font-medium">Privacy Policy</span>
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
          disabled={registrationMutation.isPending || attemptingPayment}
          className="min-h-11 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {registrationMutation.isPending || attemptingPayment
            ? 'Processing...'
            : billing.payment_method === 'credit_card'
              ? 'Pay and Complete Registration'
              : 'Complete Registration'}
        </button>
      </div>

      {/* Policy links */}
      {conference && <PolicyLinks policies={conference.policies} className="mt-4" />}

      {/* Terms & Conditions Modal */}
      {termsModalOpen && conference?.policies?.terms_and_conditions?.content && (
        <PolicyModal
          title="Terms and Conditions"
          content={conference.policies.terms_and_conditions.content}
          onClose={() => setTermsModalOpen(false)}
        />
      )}

      {/* Privacy Policy Modal */}
      {privacyModalOpen && conference?.policies?.privacy_policy?.content && (
        <PolicyModal
          title="Privacy Policy"
          content={conference.policies.privacy_policy.content}
          onClose={() => setPrivacyModalOpen(false)}
        />
      )}
    </form>
  );
}
