import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../config/api';
import { usePlatformCurrencies } from '../usePlatformCurrencies';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('usePlatformCurrencies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches currencies with correct params (page_size: 100, is_active: true)', async () => {
    const mockCurrencies = [
      { id: '1', code: 'USD', name: 'US Dollar', symbol: '$' },
      { id: '2', code: 'EUR', name: 'Euro', symbol: '€' },
    ];

    vi.mocked(api.get).mockResolvedValue({
      data: { items: mockCurrencies, total: 2 },
    });

    const { result } = renderHook(() => usePlatformCurrencies(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(api.get).toHaveBeenCalledWith('/admin/settings/currencies', {
      params: { page_size: 100, is_active: true },
    });
  });

  it('returns only the items array, not the pagination wrapper', async () => {
    const mockCurrencies = [
      { id: '1', code: 'USD', name: 'US Dollar', symbol: '$' },
      { id: '2', code: 'EUR', name: 'Euro', symbol: '€' },
    ];

    vi.mocked(api.get).mockResolvedValue({
      data: { items: mockCurrencies, total: 2, page: 1, page_size: 100 },
    });

    const { result } = renderHook(() => usePlatformCurrencies(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Should return the items array directly, not the pagination wrapper
    expect(result.current.data).toEqual(mockCurrencies);
    expect(result.current.data).not.toHaveProperty('total');
    expect(result.current.data).not.toHaveProperty('page');
    expect(result.current.data).not.toHaveProperty('page_size');
  });

  it('returns empty array when no currencies', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { items: [], total: 0 },
    });

    const { result } = renderHook(() => usePlatformCurrencies(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => usePlatformCurrencies(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');
    expect(result.current.data).toBeUndefined();
  });
});
