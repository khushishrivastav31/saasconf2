/**
 * Step 4: Review
 *
 * Summary of all data, pricing calculation, and registration submission.
 */
import { useState, useMemo } from 'react';
import { useRegistrationSubmit } from './hooks/useRegistrationSubmit';
import { useRecaptcha } from './hooks/useRecaptcha';
import { useParams } from 'react-router';
import type {
  PublicConference,
  PortalAttendee,
  PortalBilling,
  PortalRegistrationResponse,
} from '../../types/publicRegistration';

interface ReviewStepProps {
  conference: PublicConference;
  attendees: PortalAttendee[];
  billing: PortalBilling;
  formStartTime: number;
  onNext: (response: PortalRegistrationResponse) => void;
  onBack: () => void;
}

export default function ReviewStep({
  conference,
  attendees,
  billing,
  formStartTime,
  onNext,
  onBack,
}: ReviewStepProps) {
  const { tenantSlug, conferenceSlug } = useParams<{
    tenantSlug: string;
    conferenceSlug: string;
  }>();
  const [honeypot, setHoneypot] = useState('');
  const { getToken } = useRecaptcha();
  const {
    mutate: submitRegistration,
    isPending,
    error,
  } = useRegistrationSubmit(tenantSlug!, conferenceSlug!);

  // Calculate pricing
  const pricingDetails = useMemo(() => {
    const items = attendees.map((att) => {
      const option = conference.booking_options.find((opt) => opt.id === att.booking_option_id);
      return {
        name: `${att.first_name} ${att.last_name} - ${option?.name || 'Unknown'}`,
        price: option?.price || 0,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.price, 0);
    const total = subtotal; // Add VAT/tax calculation here if needed

    return { items, subtotal, total };
  }, [attendees, conference.booking_options]);

  const handleSubmit = async () => {
    // Generate reCAPTCHA token
    const recaptchaToken = await getToken('registration_submit');

    submitRegistration(
      {
        billing,
        attendees,
        recaptcha_token: recaptchaToken,
        honeypot_field: honeypot,
        form_start_timestamp: formStartTime,
      },
      {
        onSuccess: (response) => {
          onNext(response);
        },
        onError: (err) => {
          console.error('Registration failed:', err);
          // Error is handled by react-query
        },
      }
    );
  };

  return (
    <div className="portal-card">
      <h2 className="portal-heading">Review Your Registration</h2>
      <p className="portal-text">Please review all details before submitting.</p>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 my-4">
          <p className="text-red-800 dark:text-red-200">
            <strong>Error:</strong> {(error as Error).message}
          </p>
        </div>
      )}

      {/* Honeypot (hidden from users, bots will fill it) */}
      <input
        type="text"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        style={{ position: 'absolute', left: '-9999px' }}
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Attendees Summary */}
      <div className="mt-6">
        <h3 className="portal-subheading">Attendees ({attendees.length})</h3>
        <div className="space-y-2">
          {attendees.map((att, index) => {
            const option = conference.booking_options.find(
              (opt) => opt.id === att.booking_option_id
            );
            return (
              <div
                key={index}
                className="border dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {att.first_name} {att.last_name}
                    </p>
                    <p className="portal-small-text">{att.email}</p>
                    <p className="portal-small-text">{option?.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-indigo-600 dark:text-indigo-400">
                      {conference.currency} {option?.price.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Billing Summary */}
      <div className="mt-6">
        <h3 className="portal-subheading">Billing Information</h3>
        <div className="border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
          {billing.company_name && (
            <p className="portal-text">
              <strong>Company:</strong> {billing.company_name}
            </p>
          )}
          <p className="portal-text">
            <strong>Address:</strong> {billing.address_line1}
            {billing.address_line2 && `, ${billing.address_line2}`}, {billing.city},{' '}
            {billing.state_province} {billing.postal_code}, {billing.country}
          </p>
          <p className="portal-text">
            <strong>Contact:</strong> {billing.contact_name} ({billing.contact_email})
          </p>
          <p className="portal-text">
            <strong>Payment Method:</strong>{' '}
            {billing.payment_method === 'credit_card' ? 'Credit Card' : 'Bank Transfer'}
          </p>
        </div>
      </div>

      {/* Pricing Summary */}
      <div className="portal-pricing-summary mt-6">
        <h3 className="portal-subheading mb-4">Pricing Summary</h3>
        {pricingDetails.items.map((item, index) => (
          <div key={index} className="portal-pricing-row">
            <span>{item.name}</span>
            <span className="font-semibold">
              {conference.currency} {item.price.toFixed(2)}
            </span>
          </div>
        ))}
        <div className="portal-pricing-total portal-pricing-row">
          <span>Total</span>
          <span>
            {conference.currency} {pricingDetails.total.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div className="portal-button-group mt-8">
        <button
          type="button"
          onClick={onBack}
          className="portal-button portal-button-secondary"
          disabled={isPending}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="portal-button portal-button-primary"
          disabled={isPending}
        >
          {isPending ? (
            <span className="flex items-center">
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
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
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Submitting...
            </span>
          ) : (
            'Submit Registration →'
          )}
        </button>
      </div>
    </div>
  );
}
