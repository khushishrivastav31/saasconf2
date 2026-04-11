/**
 * Stripe Payment Hook for Training Registration
 *
 * Manages PaymentIntent lifecycle: create, update, and Stripe.js loading.
 * Adapted from conference useStripePayment hook.
 */
import { useState, useEffect, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';
import publicApi from '../../../config/publicApi';
import { isBankTransferCountry } from '../../../config/countries';

interface UseTrainingStripePaymentParams {
  tenantSlug: string;
  stripeEnabled: boolean;
  stripePublishableKey: string;
  bankTransferCountries: string[];
  billingCountry: string;
  paymentMethod: string;
  setPaymentMethod: (method: string) => void;
  paymentAmount: number;
}

interface UseTrainingStripePaymentReturn {
  paymentIntentId: string | null;
  clientSecret: string | null;
  publishableKey: string | null;
  stripePromise: Promise<Stripe | null> | null;
  attemptingPayment: boolean;
  setAttemptingPayment: React.Dispatch<React.SetStateAction<boolean>>;
  bankTransferAvailable: boolean;
  creditCardAvailable: boolean;
}

export function useTrainingStripePayment({
  tenantSlug,
  stripeEnabled,
  stripePublishableKey,
  bankTransferCountries,
  billingCountry,
  paymentMethod,
  setPaymentMethod,
  paymentAmount,
}: UseTrainingStripePaymentParams): UseTrainingStripePaymentReturn {
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [creatingPaymentIntent, setCreatingPaymentIntent] = useState(false);
  const [attemptingPayment, setAttemptingPayment] = useState(false);

  // Eagerly load Stripe when page mounts
  const stripePromiseRef = useRef<Promise<Stripe | null> | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);

  useEffect(() => {
    if (stripeEnabled && stripePublishableKey && !stripePromiseRef.current) {
      const promise = loadStripe(stripePublishableKey, { locale: 'en' });
      stripePromiseRef.current = promise;
      setStripePromise(promise);
    }
  }, [stripeEnabled, stripePublishableKey]);

  // Create PaymentIntent when credit card selected + positive amount
  useEffect(() => {
    if (
      paymentMethod !== 'credit_card' ||
      paymentAmount <= 0 ||
      paymentIntentId ||
      creatingPaymentIntent
    ) {
      return;
    }

    const createPaymentIntent = async () => {
      setCreatingPaymentIntent(true);
      try {
        const res = await publicApi.post<{
          payment_intent_id: string;
          client_secret: string;
          publishable_key: string;
        }>(`/portal/${tenantSlug}/trainings/create-payment-intent`, {
          total: paymentAmount,
        });
        setPaymentIntentId(res.data.payment_intent_id);
        setClientSecret(res.data.client_secret);
        setPublishableKey(res.data.publishable_key);
      } catch (err) {
        console.error('Error creating PaymentIntent:', err);
      } finally {
        setCreatingPaymentIntent(false);
      }
    };

    createPaymentIntent();
  }, [paymentMethod, paymentAmount, paymentIntentId, creatingPaymentIntent, tenantSlug]);

  // Update PaymentIntent when total changes
  useEffect(() => {
    if (paymentMethod !== 'credit_card' || !paymentIntentId || paymentAmount <= 0) {
      return;
    }

    const updatePaymentIntent = async () => {
      try {
        await publicApi.put(
          `/portal/${tenantSlug}/trainings/update-payment-intent/${paymentIntentId}`,
          { total: paymentAmount }
        );
      } catch (err) {
        console.error('Error updating PaymentIntent:', err);
      }
    };

    updatePaymentIntent();
  }, [paymentMethod, paymentIntentId, paymentAmount, tenantSlug]);

  // Clear PaymentIntent when switching away from credit card
  useEffect(() => {
    if (paymentMethod !== 'credit_card' && paymentIntentId) {
      setPaymentIntentId(null);
      setClientSecret(null);
      setPublishableKey(null);
    }
  }, [paymentMethod, paymentIntentId]);

  // Payment method availability
  const bankTransferAvailable =
    !stripeEnabled ||
    !billingCountry ||
    isBankTransferCountry(billingCountry, bankTransferCountries);
  const creditCardAvailable = stripeEnabled;

  // Auto-switch payment method based on country/availability
  useEffect(() => {
    if (!stripeEnabled && paymentMethod === 'credit_card') {
      setPaymentMethod('bank_transfer');
    } else if (
      stripeEnabled &&
      billingCountry &&
      !isBankTransferCountry(billingCountry, bankTransferCountries) &&
      paymentMethod === 'bank_transfer'
    ) {
      setPaymentMethod('credit_card');
    }
  }, [billingCountry, stripeEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

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
