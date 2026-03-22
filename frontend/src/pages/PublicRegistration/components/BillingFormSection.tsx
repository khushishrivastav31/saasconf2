/**
 * BillingFormSection
 *
 * Renders the billing information form including company details, address,
 * contact person, discount code, payment method, and inline Stripe payment.
 */
import { useState } from 'react';
import type { Stripe } from '@stripe/stripe-js';
import publicApi from '../../../config/publicApi';
import type {
  PortalAttendee,
  PortalBilling,
  DiscountCodeValidation,
} from '../../../types/publicRegistration';
import { COUNTRIES_BY_CONTINENT } from '../../../config/countries';
import { validateEmail, validatePhone } from '../../../utils/validators';
import VatNumberInput from '../../../components/common/VatNumberInput';
import InlineStripePayment from './InlineStripePayment';

interface BillingFormSectionProps {
  billing: PortalBilling;
  setBilling: React.Dispatch<React.SetStateAction<PortalBilling>>;
  attendees: PortalAttendee[];
  tenantSlug: string;
  conferenceSlug: string;
  // Discount
  discountValidation: DiscountCodeValidation | null;
  discountLoading: boolean;
  discountMessage: string | null;
  setDiscountMessage: (msg: string | null) => void;
  validateDiscountCode: (code: string) => Promise<void>;
  // VAT
  vatRequirement: { level: 'required' | 'recommended' | 'optional'; reason?: string };
  setVatValidated: (val: boolean | null) => void;
  // Payment
  clientSecret: string | null;
  publishableKey: string | null;
  stripePromise: Promise<Stripe | null> | null;
  attemptingPayment: boolean;
  setAttemptingPayment: React.Dispatch<React.SetStateAction<boolean>>;
  bankTransferAvailable: boolean;
  creditCardAvailable: boolean;
  handlePaymentComplete: () => Promise<void>;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export default function BillingFormSection({
  billing,
  setBilling,
  attendees,
  tenantSlug,
  conferenceSlug,
  discountValidation,
  discountLoading,
  discountMessage,
  setDiscountMessage,
  validateDiscountCode,
  vatRequirement,
  setVatValidated,
  clientSecret,
  publishableKey,
  stripePromise,
  attemptingPayment,
  setAttemptingPayment,
  bankTransferAvailable,
  creditCardAvailable,
  handlePaymentComplete,
  showToast,
}: BillingFormSectionProps) {
  // Contact validation state (local to this section)
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailValidated, setEmailValidated] = useState<boolean | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneValidated, setPhoneValidated] = useState<boolean | null>(null);

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

  return (
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
                  <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
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
                  <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
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
                <svg className="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
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
  );
}
