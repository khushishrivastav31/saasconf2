/**
 * Authenticated Registration Form Component
 *
 * Full registration form for logged-in portal users with alumni discount support.
 * Composes existing components: AttendeeSection, OrderSummary, InlineStripePayment, BillingFields
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import portalApi from '../../config/portalApi';
import { useApplicantAuth } from '../../hooks/useApplicantAuth';
import { usePaymentIntent } from '../../hooks/usePaymentIntent';
import AttendeeSection from '../PublicRegistration/components/AttendeeSection';
import OrderSummary from '../PublicRegistration/components/OrderSummary';
import InlineStripePayment from '../PublicRegistration/components/InlineStripePayment';
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

  // Discount validation state (for ALUMNI discount)
  const [discountValidation, setDiscountValidation] = useState<DiscountCodeValidation | null>(null);

  // Payment attempt state
  const [attemptingPayment, setAttemptingPayment] = useState(false);

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
          billing: payload.billing,
          attendees: payload.attendees,
          payment_intent_id: payload.payment_intent_id,
        }
      );
      return response.data;
    },
    onSuccess: () => {
      showToast('Registration successful!', 'success');
      // Navigate to confirmation or success page
      navigate(`/portal/conferences/${conferenceId}/registration-success`);
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
              <input
                id="discount_code"
                type="text"
                placeholder="Enter code if applicable"
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm dark:bg-gray-900 dark:text-gray-100"
                value={billing.discount_code || ''}
                onChange={(e) => {
                  setBilling({ ...billing, discount_code: e.target.value });
                }}
              />
            </div>
          )}

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Payment Method *
            </label>
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
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Bank Transfer</span>
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

            {/* Inline Stripe Payment - shows when credit card is selected */}
            {billing.payment_method === 'credit_card' && (
              <InlineStripePayment
                clientSecret={clientSecret}
                publishableKey={publishableKey}
                billingName={`${billing.contact_first_name} ${billing.contact_last_name}`.trim()}
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
                isSubmitting={attemptingPayment}
              />
            )}
          </div>
        </div>
      </div>

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
    </form>
  );
}
