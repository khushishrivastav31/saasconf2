/**
 * Single Page Registration Form
 *
 * Complete registration form on a single scrollable page.
 * Integrates attendees, billing, and booking options with real-time pricing.
 */
import { useState, useMemo, FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useGoogleReCaptcha } from 'react-google-recaptcha-v3';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import UnsavedChangesDialog from '../../components/UnsavedChangesDialog';
import { useMutation } from '@tanstack/react-query';
import publicApi from '../../config/publicApi';
import type {
  PublicConference,
  PortalAttendee,
  PortalBilling,
  PortalRegistrationResponse,
  TransformedAttendee,
} from '../../types/publicRegistration';
import ConferenceHeader from './components/ConferenceHeader';
import AttendeeSection from './components/AttendeeSection';
import OrderSummary from './components/OrderSummary';
import BillingFormSection from './components/BillingFormSection';
import { useToast } from '../../components/Toast';
import { parseApiError } from '../../utils/apiError';
import { validateEmail, validatePhone } from '../../utils/validators';
import { transformAttendees } from './helpers';
import { useDiscountCode } from './hooks/useDiscountCode';
import { useVatCalculation } from './hooks/useVatCalculation';
import { useStripePayment } from './hooks/useStripePayment';
import PolicyLinks from './components/PolicyLinks';
import PolicyModal from './components/PolicyModal';
import TermsConsentSection from './components/TermsConsentSection';

interface SinglePageFormProps {
  conference: PublicConference;
  tenantSlug: string;
  conferenceSlug: string;
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
    payment_method: conference.stripe_enabled ? 'credit_card' : 'bank_transfer',
  });

  // VAT validation state (shared with BillingFormSection and handleSubmit)
  const [vatValidated, setVatValidated] = useState<boolean | null>(null);

  // Discount code
  const {
    discountValidation,
    discountLoading,
    discountMessage,
    setDiscountMessage,
    validateDiscountCode,
  } = useDiscountCode(tenantSlug, conferenceSlug);

  // VAT calculation
  const { vatCalculation, vatRequirement, paymentAmount } = useVatCalculation({
    tenantSlug,
    conferenceSlug,
    billing,
    attendees,
    discountValidation,
    bookingPeriods: conference.booking_periods,
    conferenceCountry: conference.country || '',
    conferenceVenueType: conference.venue_type || 'in_person',
  });

  // Terms & Conditions consent (show when T&C or Privacy Policy is enabled)
  const hasTerms = !!(
    conference.policies?.terms_and_conditions || conference.policies?.privacy_policy
  );
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  // Unsaved changes guard — dirty if any attendee has meaningful data
  const isDirty = useMemo(() => {
    return attendees.some((a) => !!(a.first_name.trim() || a.last_name.trim() || a.email.trim()));
  }, [attendees]);
  const { showDialog, confirmLeave, cancelLeave } = useUnsavedChanges(isDirty);

  // Stripe payment
  const {
    paymentIntentId,
    clientSecret,
    publishableKey,
    stripePromise,
    attemptingPayment,
    setAttemptingPayment,
    bankTransferAvailable,
    creditCardAvailable,
  } = useStripePayment({
    tenantSlug,
    conferenceSlug,
    conference,
    billing,
    setBilling,
    paymentAmount,
    showToast,
  });

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
    const transformedAttendees = transformAttendees(attendees, sessionSelections);

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
        attendees: transformedAttendees,
        recaptcha_token: recaptchaToken,
        honeypot_field: honeypot,
        form_start_timestamp: formStartTime,
      };

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
      attendees: TransformedAttendee[];
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
      showToast('Please provide a valid email address', 'error');
      return;
    }

    // Phone is required
    if (!billing.contact_phone || billing.contact_phone.trim() === '') {
      showToast('Please provide a contact phone number', 'error');
      return;
    }

    const contactPhoneError = validatePhone(billing.contact_phone);
    if (contactPhoneError) {
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
      const transformedAttendees = transformAttendees(attendees, sessionSelections);

      // Submit
      submitMutation.mutate({
        billing,
        attendees: transformedAttendees,
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
        <BillingFormSection
          billing={billing}
          setBilling={setBilling}
          attendees={attendees}
          tenantSlug={tenantSlug}
          conferenceSlug={conferenceSlug}
          discountValidation={discountValidation}
          discountLoading={discountLoading}
          discountMessage={discountMessage}
          setDiscountMessage={setDiscountMessage}
          validateDiscountCode={validateDiscountCode}
          vatRequirement={vatRequirement}
          setVatValidated={setVatValidated}
          clientSecret={clientSecret}
          publishableKey={publishableKey}
          stripePromise={stripePromise}
          attemptingPayment={attemptingPayment}
          setAttemptingPayment={setAttemptingPayment}
          bankTransferAvailable={bankTransferAvailable}
          creditCardAvailable={creditCardAvailable}
          handlePaymentComplete={handlePaymentComplete}
          showToast={showToast}
        />

        {/* Terms & Conditions / Privacy Policy Consent */}
        {hasTerms && (
          <TermsConsentSection
            policies={conference.policies}
            termsAccepted={termsAccepted}
            setTermsAccepted={setTermsAccepted}
            setTermsModalOpen={setTermsModalOpen}
            setPrivacyModalOpen={setPrivacyModalOpen}
          />
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
      <UnsavedChangesDialog open={showDialog} onConfirm={confirmLeave} onCancel={cancelLeave} />
    </form>
  );
}
