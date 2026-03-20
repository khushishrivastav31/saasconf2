/**
 * Payment Modal Component
 *
 * Displays an embedded Stripe Elements payment form in a modal overlay.
 * Shows order summary and handles payment confirmation.
 */
import { useState, useEffect, FormEvent } from 'react';
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { PortalAttendee, PublicBookingOption } from '../../../types/publicRegistration';
import { formatPrice } from '../helpers';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  clientSecret: string;
  publishableKey: string;
  attendees: PortalAttendee[];
  bookingOptions: PublicBookingOption[];
  currency: string;
  total: number;
  vatAmount?: number;
  vatRate?: number;
}

// Payment form component (inside Elements provider)
function PaymentForm({
  onSuccess,
  onError,
  total,
  currency,
}: {
  onSuccess: () => void;
  onError: (message: string) => void;
  total: number;
  currency: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin, // Fallback, shouldn't be used
        },
        redirect: 'if_required', // Don't redirect, handle in-page
      });

      if (error) {
        onError(error.message || 'Payment failed. Please try again.');
      } else {
        // Payment succeeded
        onSuccess();
      }
    } catch {
      onError('An unexpected error occurred. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Stripe Payment Element */}
      <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md">
        <PaymentElement />
      </div>

      {/* Total amount */}
      <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
        <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Total Amount</span>
        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {formatPrice(total, currency)}
        </span>
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full px-6 py-3 text-base font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {isProcessing ? 'Processing...' : 'Pay Now'}
      </button>

      <p className="text-xs text-center text-gray-500 dark:text-gray-400">
        Your payment is secured by Stripe. Your card details are never shared with us.
      </p>
    </form>
  );
}

export default function PaymentModal({
  isOpen,
  onClose,
  onSuccess,
  clientSecret,
  publishableKey,
  attendees,
  bookingOptions,
  currency,
  total,
  vatAmount,
  vatRate,
}: PaymentModalProps) {
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize Stripe with English locale
  useEffect(() => {
    console.log('PaymentModal mounted:', { isOpen, clientSecret, publishableKey, total });
    if (publishableKey) {
      console.log('Loading Stripe with key:', publishableKey);
      setStripePromise(loadStripe(publishableKey, { locale: 'en' }));
    }
  }, [publishableKey, isOpen, clientSecret, total]);

  if (!isOpen) {
    console.log('PaymentModal not showing (isOpen = false)');
    return null;
  }

  console.log('PaymentModal rendering...');

  const options: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#6366f1',
      },
    },
  };

  // Count attendees by booking option
  const attendeeCounts = new Map<string, number>();
  attendees.forEach((attendee) => {
    attendee.booking_option_ids?.forEach((optionId) => {
      attendeeCounts.set(optionId, (attendeeCounts.get(optionId) || 0) + 1);
    });
  });

  const handleSuccess = () => {
    setErrorMessage(null);
    onSuccess();
  };

  const handleError = (message: string) => {
    setErrorMessage(message);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Complete Payment
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-6 space-y-6">
            {/* Preview Mode Info */}
            {clientSecret?.includes('preview') && (
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md p-4">
                <p className="text-sm text-blue-800 dark:text-blue-200 font-semibold mb-1">
                  💳 Payment Preview
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  This is a preview of the payment form you'll see after submitting your
                  registration. Complete the registration form and click "Submit Registration" to
                  proceed with actual payment.
                </p>
              </div>
            )}

            {/* Order Summary */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Order Summary
              </h3>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 space-y-2">
                {Array.from(attendeeCounts.entries()).map(([optionId, count]) => {
                  const option = bookingOptions.find((opt) => opt.id === optionId);
                  if (!option) return null;
                  return (
                    <div
                      key={optionId}
                      className="flex justify-between text-sm text-gray-700 dark:text-gray-300"
                    >
                      <span>
                        {count} × {option.name}
                      </span>
                      <span>{formatPrice(option.price * count, currency)}</span>
                    </div>
                  );
                })}

                {/* VAT if applicable */}
                {vatAmount && vatRate ? (
                  <>
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2" />
                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                      <span>VAT ({vatRate}%)</span>
                      <span>{formatPrice(vatAmount, currency)}</span>
                    </div>
                  </>
                ) : null}

                <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2" />
                <div className="flex justify-between text-base font-semibold text-gray-900 dark:text-gray-100">
                  <span>Total</span>
                  <span>{formatPrice(total, currency)}</span>
                </div>
              </div>
            </div>

            {/* Error message */}
            {errorMessage && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md p-4">
                <p className="text-sm text-red-800 dark:text-red-200">{errorMessage}</p>
              </div>
            )}

            {/* Payment form */}
            {clientSecret?.includes('preview') ? (
              // Preview mode - show placeholder
              <div className="space-y-4">
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-md">
                  <div className="space-y-3">
                    <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                    <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                    <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  </div>
                  <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-4">
                    Payment form will appear here after submitting registration
                  </p>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Total Amount
                  </span>
                  <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {formatPrice(total, currency)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full px-6 py-3 text-base font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Close Preview
                </button>
              </div>
            ) : stripePromise && clientSecret ? (
              <Elements stripe={stripePromise} options={options}>
                <PaymentForm
                  onSuccess={handleSuccess}
                  onError={handleError}
                  total={total}
                  currency={currency}
                />
              </Elements>
            ) : (
              <div className="flex justify-center py-8">
                <svg
                  className="animate-spin h-8 w-8 text-primary-600"
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
        </div>
      </div>
    </div>
  );
}
