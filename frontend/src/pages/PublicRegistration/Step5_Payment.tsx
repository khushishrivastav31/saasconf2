/**
 * Step 5: Payment
 *
 * Stripe Elements integration for credit card payments or bank transfer confirmation.
 */
import { useState, useEffect } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { PortalRegistrationResponse } from '../../types/publicRegistration';

interface PaymentStepProps {
  registrationResponse: PortalRegistrationResponse;
  onSuccess: () => void;
  onBack: () => void;
}

// Stripe Elements payment form component
function PaymentForm({ onSuccess, onBack }: { onSuccess: () => void; onBack: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setErrorMessage('Payment system not loaded. Please refresh and try again.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href, // Fallback (we handle success in-app)
        },
        redirect: 'if_required', // Stay on page if no 3D Secure required
      });

      if (error) {
        setErrorMessage(error.message || 'Payment failed. Please try again.');
      } else {
        // Payment succeeded
        onSuccess();
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Error Display */}
      {errorMessage && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
          <p className="text-red-800 dark:text-red-200">
            <strong>Error:</strong> {errorMessage}
          </p>
        </div>
      )}

      {/* Stripe Payment Element */}
      <div className="my-6">
        <PaymentElement />
      </div>

      {/* Security Notice */}
      <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4 my-4">
        <p className="text-sm text-green-800 dark:text-green-200">
          🔒 Your payment is secured by Stripe. Card details are never stored on our servers.
        </p>
      </div>

      {/* Navigation */}
      <div className="portal-button-group mt-8">
        <button
          type="button"
          onClick={onBack}
          className="portal-button portal-button-secondary"
          disabled={isProcessing}
        >
          ← Back
        </button>
        <button
          type="submit"
          className="portal-button portal-button-primary"
          disabled={!stripe || isProcessing}
        >
          {isProcessing ? (
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
              Processing Payment...
            </span>
          ) : (
            'Pay Now →'
          )}
        </button>
      </div>
    </form>
  );
}

export default function PaymentStep({ registrationResponse, onSuccess, onBack }: PaymentStepProps) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  useEffect(() => {
    if (registrationResponse.stripe_publishable_key) {
      setStripePromise(loadStripe(registrationResponse.stripe_publishable_key));
    }
  }, [registrationResponse.stripe_publishable_key]);

  // Bank Transfer flow (skip payment, go directly to confirmation)
  if (!registrationResponse.payment_required || !registrationResponse.payment_client_secret) {
    return (
      <div className="portal-card">
        <h2 className="portal-heading">Bank Transfer Instructions</h2>
        <p className="portal-text">
          Your registration has been submitted successfully! An invoice will be sent to your billing
          email with bank transfer instructions.
        </p>

        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 my-6">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Next Steps:</h3>
          <ol className="list-decimal list-inside space-y-1 text-blue-800 dark:text-blue-200">
            <li>Check your email for the invoice with payment details</li>
            <li>Complete the bank transfer within 7 days</li>
            <li>Your registration will be confirmed once payment is received</li>
          </ol>
        </div>

        <div className="portal-button-group mt-8">
          <button type="button" onClick={onSuccess} className="portal-button portal-button-primary">
            Continue to Confirmation →
          </button>
        </div>
      </div>
    );
  }

  // Credit Card Payment with Stripe Elements
  if (!stripePromise || !registrationResponse.payment_client_secret) {
    return (
      <div className="portal-card">
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-card">
      <h2 className="portal-heading">Payment</h2>
      <p className="portal-text">Complete your payment to finalize your registration.</p>

      <Elements
        stripe={stripePromise}
        options={{
          clientSecret: registrationResponse.payment_client_secret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#4f46e5',
            },
          },
        }}
      >
        <PaymentForm onSuccess={onSuccess} onBack={onBack} />
      </Elements>
    </div>
  );
}
