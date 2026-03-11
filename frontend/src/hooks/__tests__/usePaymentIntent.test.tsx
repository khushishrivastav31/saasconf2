import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePaymentIntent } from '../usePaymentIntent';
import type { UsePaymentIntentOptions } from '../usePaymentIntent';

describe('usePaymentIntent', () => {
  let mockApiClient: UsePaymentIntentOptions['apiClient'];

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApiClient = {
      post: vi.fn().mockResolvedValue({
        data: {
          payment_intent_id: 'pi_test123',
          client_secret: 'cs_test_secret',
          publishable_key: 'pk_test_key',
        },
      }),
    };
  });

  const defaultOptions: UsePaymentIntentOptions = {
    total: 100,
    currency: 'EUR',
    enabled: true,
    createEndpoint: '/api/payment-intents',
    updateEndpoint: (id: string) => `/api/payment-intents/${id}`,
    apiClient: null as unknown as UsePaymentIntentOptions['apiClient'],
  };

  function renderPaymentHook(overrides: Partial<UsePaymentIntentOptions> = {}) {
    return renderHook((props: UsePaymentIntentOptions) => usePaymentIntent(props), {
      initialProps: {
        ...defaultOptions,
        apiClient: mockApiClient,
        ...overrides,
      },
    });
  }

  it('starts with null state', () => {
    const { result } = renderPaymentHook({ enabled: false, total: 0 });

    expect(result.current.paymentIntentId).toBeNull();
    expect(result.current.clientSecret).toBeNull();
    expect(result.current.publishableKey).toBeNull();
    expect(result.current.isCreating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('creates a payment intent when enabled with positive total', async () => {
    const { result } = renderPaymentHook({ total: 50, currency: 'USD' });

    await waitFor(() => {
      expect(result.current.paymentIntentId).toBe('pi_test123');
    });

    expect(result.current.clientSecret).toBe('cs_test_secret');
    expect(result.current.publishableKey).toBe('pk_test_key');
    expect(mockApiClient.post).toHaveBeenCalledWith('/api/payment-intents', {
      amount: 5000, // 50 * 100 cents
      currency: 'usd', // lowercased
    });
  });

  it('does not create when total is 0', async () => {
    renderPaymentHook({ total: 0, enabled: true });

    // Allow effects to run
    await waitFor(() => {
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });
  });

  it('does not create when total is negative', async () => {
    renderPaymentHook({ total: -10, enabled: true });

    await waitFor(() => {
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });
  });

  it('does not create when disabled', async () => {
    renderPaymentHook({ enabled: false, total: 100 });

    await waitFor(() => {
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });
  });

  it('clears payment intent when disabled after being enabled', async () => {
    const { result, rerender } = renderPaymentHook({ enabled: true, total: 100 });

    await waitFor(() => {
      expect(result.current.paymentIntentId).toBe('pi_test123');
    });

    rerender({
      ...defaultOptions,
      apiClient: mockApiClient,
      enabled: false,
      total: 100,
    });

    await waitFor(() => {
      expect(result.current.paymentIntentId).toBeNull();
      expect(result.current.clientSecret).toBeNull();
      expect(result.current.publishableKey).toBeNull();
    });
  });

  it('updates existing payment intent when total changes', async () => {
    const updateResponse = {
      data: {
        client_secret: 'cs_updated_secret',
        publishable_key: 'pk_test_key',
      },
    };

    const { result, rerender } = renderPaymentHook({ total: 100 });

    // Wait for initial creation
    await waitFor(() => {
      expect(result.current.paymentIntentId).toBe('pi_test123');
    });

    // Mock the update call
    (mockApiClient.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(updateResponse);

    rerender({
      ...defaultOptions,
      apiClient: mockApiClient,
      total: 200,
    });

    await waitFor(() => {
      expect(result.current.clientSecret).toBe('cs_updated_secret');
    });

    // Verify update endpoint was called with the payment intent ID
    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/api/payment-intents/pi_test123',
      { amount: 20000 } // 200 * 100
    );
  });

  it('sets error when API call fails with Error', async () => {
    (mockApiClient.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Stripe API failed')
    );

    const { result } = renderPaymentHook({ total: 100 });

    await waitFor(() => {
      expect(result.current.error).toBe('Stripe API failed');
    });

    expect(result.current.isCreating).toBe(false);
  });

  it('sets generic error when API call fails with non-Error', async () => {
    (mockApiClient.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce('unknown error');

    const { result } = renderPaymentHook({ total: 100 });

    await waitFor(() => {
      expect(result.current.error).toBe('Payment intent error');
    });
  });

  it('clear() resets all state', async () => {
    const { result } = renderPaymentHook({ total: 100 });

    await waitFor(() => {
      expect(result.current.paymentIntentId).toBe('pi_test123');
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.paymentIntentId).toBeNull();
    expect(result.current.clientSecret).toBeNull();
    expect(result.current.publishableKey).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('converts amount to cents (integer)', async () => {
    renderPaymentHook({ total: 99.99 });

    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/api/payment-intents',
        expect.objectContaining({ amount: 9999 })
      );
    });
  });

  it('lowercases currency code', async () => {
    renderPaymentHook({ total: 100, currency: 'GBP' });

    await waitFor(() => {
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/api/payment-intents',
        expect.objectContaining({ currency: 'gbp' })
      );
    });
  });
});
