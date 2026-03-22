import { useState, useEffect, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';
import publicApi from '../../../config/publicApi';
import { isBankTransferCountry } from '../../../config/countries';
import type { PublicConference, PortalBilling } from '../../../types/publicRegistration';

interface UseStripePaymentParams {
  tenantSlug: string;
  conferenceSlug: string;
  conference: PublicConference;
  billing: PortalBilling;
  setBilling: React.Dispatch<React.SetStateAction<PortalBilling>>;
  paymentAmount: number;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface UseStripePaymentReturn {
  paymentIntentId: string | null;
  clientSecret: string | null;
  publishableKey: string | null;
  stripePromise: Promise<Stripe | null> | null;
  attemptingPayment: boolean;
  setAttemptingPayment: React.Dispatch<React.SetStateAction<boolean>>;
  bankTransferAvailable: boolean;
  creditCardAvailable: boolean;
}

export function useStripePayment({
  tenantSlug,
  conferenceSlug,
  conference,
  billing,
  setBilling,
  paymentAmount,
  showToast,
}: UseStripePaymentParams): UseStripePaymentReturn {
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [creatingPaymentIntent, setCreatingPaymentIntent] = useState(false);
  const [attemptingPayment, setAttemptingPayment] = useState(false);

  // Eagerly load Stripe when page mounts (not when user selects credit card)
  // This eliminates the race condition between Stripe initialization and PaymentIntent creation
  const stripePromiseRef = useRef<Promise<Stripe | null> | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const stripeEnabled = conference.stripe_enabled ?? false;

  useEffect(() => {
    if (stripeEnabled && conference.stripe_publishable_key && !stripePromiseRef.current) {
      const promise = loadStripe(conference.stripe_publishable_key, { locale: 'en' });
      stripePromiseRef.current = promise;
      setStripePromise(promise);
    }
  }, [stripeEnabled, conference.stripe_publishable_key]);

  // Create PaymentIntent when credit card is selected and there's a positive amount
  useEffect(() => {
    const shouldCreatePaymentIntent =
      billing.payment_method === 'credit_card' &&
      paymentAmount > 0 &&
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
          total: paymentAmount,
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
    paymentAmount,
    paymentIntentId,
    creatingPaymentIntent,
    tenantSlug,
    conferenceSlug,
    showToast,
  ]);

  // Update PaymentIntent when total changes
  useEffect(() => {
    const shouldUpdatePaymentIntent =
      billing.payment_method === 'credit_card' && paymentIntentId && paymentAmount > 0;

    if (!shouldUpdatePaymentIntent) {
      return;
    }

    const updatePaymentIntent = async () => {
      try {
        await publicApi.put(
          `/portal/${tenantSlug}/conferences/${conferenceSlug}/update-payment-intent/${paymentIntentId}`,
          {
            total: paymentAmount,
          }
        );
      } catch (err) {
        console.error('Error updating PaymentIntent:', err);
        // Don't show error toast - this is a background update
      }
    };

    updatePaymentIntent();
  }, [billing.payment_method, paymentIntentId, paymentAmount, tenantSlug, conferenceSlug]);

  // Clear PaymentIntent when switching away from credit card
  useEffect(() => {
    if (billing.payment_method !== 'credit_card' && paymentIntentId) {
      setPaymentIntentId(null);
      setClientSecret(null);
      setPublishableKey(null);
    }
  }, [billing.payment_method, paymentIntentId]);

  // Payment method availability based on Stripe status and country
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

  return {
    paymentIntentId,
    clientSecret,
    publishableKey,
    stripePromise,
    attemptingPayment,
    setAttemptingPayment,
    bankTransferAvailable,
    creditCardAvailable,
  };
}
