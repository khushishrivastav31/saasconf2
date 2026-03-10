/**
 * Inline Stripe Payment Component
 *
 * Displays Stripe Payment Element inline below payment method selection.
 * Expands when credit card is selected, similar to Stripe Checkout.
 */
import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

interface InlineStripePaymentProps {
  clientSecret: string | null;
  publishableKey: string | null;
  billingName?: string; // Cardholder name from billing contact
  onSuccess: () => void;
  onError: (message: string) => void;
  isSubmitting?: boolean;
}

// Payment form component (inside Elements provider)
function PaymentForm({
  onSuccess,
  onError,
  isSubmitting,
  billingName,
}: {
  onSuccess: () => void;
  onError: (message: string) => void;
  isSubmitting?: boolean;
  billingName?: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // When parent form is submitted, trigger payment confirmation
    if (isSubmitting && stripe && elements && !isProcessing) {
      handlePayment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSubmitting]);

  const handlePayment = async () => {
    if (!stripe || !elements || isProcessing) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: {
          return_url: window.location.origin,
        },
      });

      if (error) {
        onError(error.message || 'Payment failed. Please try again.');
        setIsProcessing(false);
      } else {
        // Payment succeeded
        onSuccess();
      }
    } catch {
      onError('An unexpected error occurred. Please try again.');
      setIsProcessing(false);
    }
  };

  // PaymentElement options with pre-filled billing name
  const paymentElementOptions = billingName
    ? {
        defaultValues: {
          billingDetails: {
            name: billingName,
          },
        },
      }
    : {};

  return (
    <div className="space-y-4">
      <PaymentElement options={paymentElementOptions} />
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Your payment is secured by Stripe. Card details are encrypted and never shared with us.
      </p>
    </div>
  );
}

export default function InlineStripePayment({
  clientSecret,
  publishableKey,
  billingName,
  onSuccess,
  onError,
  isSubmitting,
}: InlineStripePaymentProps) {
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);

  // Initialize Stripe with English locale
  useEffect(() => {
    if (publishableKey) {
      setStripePromise(loadStripe(publishableKey, { locale: 'en' }));
    }
  }, [publishableKey]);

  if (!clientSecret || !publishableKey) {
    // Show loading state while creating payment intent
    return (
      <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="space-y-3">
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
        </div>
        <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-4">
          Preparing secure payment form...
        </p>
      </div>
    );
  }

  if (!stripePromise) {
    return (
      <div className="mt-4 flex justify-center py-4">
        <svg className="animate-spin h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24">
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
    );
  }

  const options = {
    clientSecret,
    appearance: {
      theme: 'stripe' as const,
      variables: {
        colorPrimary: '#6366f1',
      },
    },
    // Pre-fill billing name from contact information
    defaultValues: billingName
      ? {
          billingDetails: {
            name: billingName,
          },
        }
      : undefined,
  };

  return (
    <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <Elements stripe={stripePromise} options={options}>
        <PaymentForm
          onSuccess={onSuccess}
          onError={onError}
          isSubmitting={isSubmitting}
          billingName={billingName}
        />
      </Elements>
    </div>
  );
}
