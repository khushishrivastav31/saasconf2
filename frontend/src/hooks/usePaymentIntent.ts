/**
 * Hook for managing Stripe PaymentIntent lifecycle
 *
 * Provides consistent PaymentIntent create/update logic across
 * authenticated portal and public registration flows.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface UsePaymentIntentOptions {
  total: number;
  currency: string;
  enabled: boolean; // Only create when payment method is credit_card
  createEndpoint: string; // API endpoint for creating PaymentIntent
  updateEndpoint: (paymentIntentId: string) => string; // API endpoint for updating
  apiClient: {
    post: <T>(url: string, data: Record<string, unknown>) => Promise<{ data: T }>;
  };
}

export interface PaymentIntentState {
  paymentIntentId: string | null;
  clientSecret: string | null;
  publishableKey: string | null;
  isCreating: boolean;
  error: string | null;
}

export function usePaymentIntent({
  total,
  currency,
  enabled,
  createEndpoint,
  updateEndpoint,
  apiClient,
}: UsePaymentIntentOptions) {
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const isCreatingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const createOrUpdatePaymentIntent = useCallback(
    async (amount: number) => {
      if (!enabled || amount <= 0 || isCreatingRef.current) return;

      isCreatingRef.current = true;
      setIsCreating(true);
      setError(null);

      try {
        if (paymentIntentId) {
          // Update existing payment intent
          const response = await apiClient.post<{
            client_secret: string;
            publishable_key: string;
          }>(updateEndpoint(paymentIntentId), {
            amount: Math.round(amount * 100), // Convert to cents
          });

          setClientSecret(response.data.client_secret);
          setPublishableKey(response.data.publishable_key);
        } else {
          // Create new payment intent
          const response = await apiClient.post<{
            payment_intent_id: string;
            client_secret: string;
            publishable_key: string;
          }>(createEndpoint, {
            amount: Math.round(amount * 100), // Convert to cents
            currency: currency.toLowerCase(),
          });

          setPaymentIntentId(response.data.payment_intent_id);
          setClientSecret(response.data.client_secret);
          setPublishableKey(response.data.publishable_key);
        }
      } catch (err) {
        console.error('PaymentIntent creation/update error:', err);
        setError(err instanceof Error ? err.message : 'Payment intent error');
      } finally {
        isCreatingRef.current = false;
        setIsCreating(false);
      }
    },
    [enabled, paymentIntentId, createEndpoint, updateEndpoint, currency, apiClient]
  );

  const clearPaymentIntent = useCallback(() => {
    setPaymentIntentId(null);
    setClientSecret(null);
    setPublishableKey(null);
    setError(null);
  }, []);

  // Auto-trigger create/update when total changes
  useEffect(() => {
    if (enabled && total > 0) {
      createOrUpdatePaymentIntent(total);
    } else if (!enabled) {
      // Clear when switching away from credit card
      clearPaymentIntent();
    }
  }, [enabled, total, createOrUpdatePaymentIntent, clearPaymentIntent]);

  return {
    paymentIntentId,
    clientSecret,
    publishableKey,
    isCreating,
    error,
    createOrUpdate: createOrUpdatePaymentIntent,
    clear: clearPaymentIntent,
  };
}
