/**
 * Authenticated Registration Form Component
 *
 * Full registration form for logged-in portal users with alumni discount support.
 * Composes existing components: AttendeeSection, OrderSummary, InlineStripePayment, BillingFields
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import portalApi from '../../config/portalApi';
import { useApplicantAuth } from '../../hooks/useApplicantAuth';
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

  // PaymentIntent state for credit card payment
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [creatingPaymentIntent, setCreatingPaymentIntent] = useState(false);
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

  // Trigger VAT calculation when billing country/VAT number changes
  useEffect(() => {
    if (!conference) return;

    // Calculate subtotal
    let subtotal = 0;
    attendees.forEach((att) => {
      att.booking_option_ids?.forEach((optionId) => {
        const option = conference.booking_options.find((opt) => opt.id === optionId);
        if (option) {
          subtotal += option.price;
        }
      });
    });

    // Apply alumni discount
    if (discountValidation?.valid && discountValidation.discount_type === 'percentage') {
      subtotal = subtotal * (1 - (discountValidation.discount_value || 0) / 100);
    }

    calculateVat(subtotal, billing.country, billing.vat_number || null);
  }, [
    billing.country,
    billing.vat_number,
    attendees,
    discountValidation,
    conference,
    calculateVat,
  ]);

  // Create or update payment intent when total changes (credit card only)
  useEffect(() => {
    if (billing.payment_method !== 'credit_card' || !conference) return;

    // Calculate total with VAT
    let subtotal = 0;
    attendees.forEach((att) => {
      att.booking_option_ids?.forEach((optionId) => {
        const option = conference.booking_options.find((opt) => opt.id === optionId);
        if (option) {
          subtotal += option.price;
        }
      });
    });

    // Apply alumni discount
    if (discountValidation?.valid && discountValidation.discount_type === 'percentage') {
      subtotal = subtotal * (1 - (discountValidation.discount_value || 0) / 100);
    }

    const total = subtotal + (vatCalculation?.vat_amount || 0);

    if (total > 0) {
      createOrUpdatePaymentIntent(total);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billing.payment_method, attendees, discountValidation, vatCalculation, conference]);

  const createOrUpdatePaymentIntent = async (total: number) => {
    if (creatingPaymentIntent) return;

    setCreatingPaymentIntent(true);

    try {
      if (paymentIntentId) {
        // Update existing payment intent
        const response = await portalApi.post<{
          client_secret: string;
          publishable_key: string;
        }>(`/portal/conferences/${conferenceId}/update-payment-intent`, {
          payment_intent_id: paymentIntentId,
          amount: Math.round(total * 100), // Convert to cents
        });
        setClientSecret(response.data.client_secret);
        setPublishableKey(response.data.publishable_key);
      } else {
        // Create new payment intent
        const response = await portalApi.post<{
          payment_intent_id: string;
          client_secret: string;
          publishable_key: string;
        }>(`/portal/conferences/${conferenceId}/create-payment-intent`, {
          amount: Math.round(total * 100), // Convert to cents
          currency: conference?.currency?.toLowerCase() || 'eur',
        });
        setPaymentIntentId(response.data.payment_intent_id);
        setClientSecret(response.data.client_secret);
        setPublishableKey(response.data.publishable_key);
      }
    } catch (error) {
      showToast(parseApiError(error), 'error');
    } finally {
      setCreatingPaymentIntent(false);
    }
  };

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

  // Multi-attendee handlers
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

  const removeAttendee = (index: number) => {
    if (attendees.length === 1) return;
    setAttendees(attendees.filter((_, i) => i !== index));
    // Remove session selections for this attendee
    const newSelections = { ...sessionSelections };
    delete newSelections[index];
    setSessionSelections(newSelections);
  };

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

    if (attendees.some((att) => !att.first_name || !att.last_name || !att.email)) {
      showToast('Please fill in all required attendee fields', 'error');
      return;
    }

    if (attendees.some((att) => att.booking_option_ids.length === 0)) {
      showToast('Please select at least one booking option for each attendee', 'error');
      return;
    }

    if (!billing.street || !billing.postal_code || !billing.city || !billing.country) {
      showToast('Please fill in all required billing fields', 'error');
      return;
    }

    if (billing.payment_method === 'credit_card') {
      // For credit card, trigger Stripe payment confirmation
      setAttemptingPayment(true);
      // Payment will be confirmed by InlineStripePayment component
    } else {
      // For bank transfer, submit directly
      registrationMutation.mutate({
        billing,
        attendees,
      });
    }
  };

  // Payment success handler (for credit card)
  const handlePaymentSuccess = () => {
    // Payment confirmed, now submit registration
    registrationMutation.mutate({
      billing,
      attendees,
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
            tenantSlug={conferenceId} // Using conferenceId as fallback
            conferenceSlug={conferenceId}
            sessionSelections={sessionSelections[index]}
            onSessionChange={(optionId, selections) =>
              handleSessionChange(index, optionId, selections)
            }
            onChange={(updated) => updateAttendee(index, updated)}
            onRemove={() => removeAttendee(index)}
            canRemove={attendees.length > 1}
          />
        ))}

        <button
          type="button"
          onClick={addAttendee}
          className="w-full sm:w-auto min-h-[44px] px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          + Add Another Attendee
        </button>
      </div>

      {/* Billing Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Billing Information
        </h2>
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
        />
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

      {/* Inline Stripe Payment (credit card only) */}
      {billing.payment_method === 'credit_card' && clientSecret && publishableKey && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Payment Details
          </h2>
          <InlineStripePayment
            clientSecret={clientSecret}
            publishableKey={publishableKey}
            billingName={`${billing.contact_first_name} ${billing.contact_last_name}`}
            onSuccess={handlePaymentSuccess}
            onError={handlePaymentError}
            isSubmitting={attemptingPayment}
          />
        </div>
      )}

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={registrationMutation.isPending || attemptingPayment}
          className="min-h-[44px] px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
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
