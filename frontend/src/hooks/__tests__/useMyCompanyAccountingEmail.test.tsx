import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMyCompanyAccountingEmail } from '../useMyCompanyAccountingEmail';

vi.mock('../../config/api', () => ({
  default: { get: vi.fn() },
}));

import api from '../../config/api';

const mockApi = vi.mocked(api);

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useMyCompanyAccountingEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports isConfigured=true when accounting_email is set', async () => {
    mockApi.get.mockResolvedValue({ data: { accounting_email: 'ar@acme.test' } });

    const { result } = renderHook(() => useMyCompanyAccountingEmail(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isConfigured).toBe(true);
    expect(result.current.email).toBe('ar@acme.test');
  });

  it('reports isConfigured=false when accounting_email is null', async () => {
    mockApi.get.mockResolvedValue({ data: { accounting_email: null } });

    const { result } = renderHook(() => useMyCompanyAccountingEmail(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isConfigured).toBe(false);
    expect(result.current.email).toBeNull();
  });

  it('reports isConfigured=false when accounting_email is whitespace', async () => {
    mockApi.get.mockResolvedValue({ data: { accounting_email: '   ' } });

    const { result } = renderHook(() => useMyCompanyAccountingEmail(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isConfigured).toBe(false);
  });
});
