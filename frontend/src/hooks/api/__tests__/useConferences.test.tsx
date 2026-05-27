import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the api module before importing anything that depends on it
vi.mock('../../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../config/api';
import {
  useConferenceList,
  useConferenceDetail,
  useConferenceStats,
  useConferencesForSelect,
  useCreateConference,
} from '../useConferences';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Create a wrapper that exposes the underlying QueryClient so tests can
 * inspect the cache directly (e.g. to verify invalidation).
 */
function createWrapperWithClient() {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockConference = {
  id: 'conf-1',
  tenant_id: 'tenant-1',
  tenant_slug: 'acme',
  name: 'React Summit 2026',
  abbreviation: 'RS26',
  description: 'A conference about React',
  website: 'https://reactsummit.example.com',
  logo_url: null,
  support_email: 'support@reactsummit.example.com',
  contact_email: 'contact@reactsummit.example.com',
  start_date: '2026-06-01',
  end_date: '2026-06-03',
  venue_name: 'Convention Center',
  venue_address: '123 Main St',
  city: 'Berlin',
  state: null,
  postal_code: '10115',
  country: 'DE',
  timezone: 'Europe/Berlin',
  venue_url: null,
  status: 'published',
};

const mockConference2 = {
  ...mockConference,
  id: 'conf-2',
  name: 'VueConf 2026',
  abbreviation: 'VC26',
  status: 'draft',
};

const mockPaginatedConferences = {
  items: [mockConference, mockConference2],
  total: 2,
  page: 1,
  page_size: 25,
  pages: 1,
};

const mockStats = {
  total: 10,
  active: 4,
  published: 6,
  upcoming: 3,
  ongoing: 1,
  past: 6,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useConferences hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // -----------------------------------------------------------------------
  // useConferenceList
  // -----------------------------------------------------------------------

  describe('useConferenceList', () => {
    it('fetches the conference list on mount', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: mockPaginatedConferences });

      const { result } = renderHook(() => useConferenceList(), {
        wrapper: createWrapper(),
      });

      // Initially loading
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockPaginatedConferences);
      expect(api.get).toHaveBeenCalledTimes(1);
      // When no status filter is provided the URL should have an empty query string
      expect(api.get).toHaveBeenCalledWith('/conferences?');
    });

    it('passes the status filter as a query param', async () => {
      const filteredResponse = {
        ...mockPaginatedConferences,
        items: [mockConference],
        total: 1,
      };
      vi.mocked(api.get).mockResolvedValue({ data: filteredResponse });

      const { result } = renderHook(() => useConferenceList('published'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(filteredResponse);
      expect(api.get).toHaveBeenCalledWith('/conferences?status=published');
    });

    it('passes a draft status filter correctly', async () => {
      const draftResponse = {
        ...mockPaginatedConferences,
        items: [mockConference2],
        total: 1,
      };
      vi.mocked(api.get).mockResolvedValue({ data: draftResponse });

      const { result } = renderHook(() => useConferenceList('draft'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.get).toHaveBeenCalledWith('/conferences?status=draft');
      expect(result.current.data?.items).toHaveLength(1);
      expect(result.current.data?.items[0].status).toBe('draft');
    });

    it('returns error state when the API call fails', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useConferenceList(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Network error');
    });
  });

  // -----------------------------------------------------------------------
  // useConferenceDetail
  // -----------------------------------------------------------------------

  describe('useConferenceDetail', () => {
    it('fetches a conference by ID', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: mockConference });

      const { result } = renderHook(() => useConferenceDetail('conf-1'), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockConference);
      expect(api.get).toHaveBeenCalledWith('/conferences/conf-1');
    });

    it('is disabled when conferenceId is undefined', () => {
      const { result } = renderHook(() => useConferenceDetail(undefined), {
        wrapper: createWrapper(),
      });

      // The query should not be loading because it is disabled
      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe('idle');
      expect(result.current.data).toBeUndefined();
      expect(api.get).not.toHaveBeenCalled();
    });

    it('is disabled when conferenceId is an empty string', () => {
      const { result } = renderHook(() => useConferenceDetail(''), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(result.current.data).toBeUndefined();
      expect(api.get).not.toHaveBeenCalled();
    });

    it('returns error state when the API call fails', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Conference not found'));

      const { result } = renderHook(() => useConferenceDetail('bad-id'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Conference not found');
    });
  });

  // -----------------------------------------------------------------------
  // useConferenceStats
  // -----------------------------------------------------------------------

  describe('useConferenceStats', () => {
    it('fetches conference stats', async () => {
      vi.mocked(api.get).mockResolvedValue({ data: mockStats });

      const { result } = renderHook(() => useConferenceStats(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockStats);
      expect(api.get).toHaveBeenCalledWith('/conferences/stats');
    });

    it('returns error state when the API call fails', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Server error'));

      const { result } = renderHook(() => useConferenceStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Server error');
    });
  });

  // -----------------------------------------------------------------------
  // useConferencesForSelect
  // -----------------------------------------------------------------------

  describe('useConferencesForSelect', () => {
    it('fetches conferences with page_size=100', async () => {
      const selectResponse = {
        ...mockPaginatedConferences,
        page_size: 100,
      };
      vi.mocked(api.get).mockResolvedValue({ data: selectResponse });

      const { result } = renderHook(() => useConferencesForSelect(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(selectResponse);
      expect(api.get).toHaveBeenCalledWith('/conferences?page_size=100');
    });

    it('returns error state when the API call fails', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Forbidden'));

      const { result } = renderHook(() => useConferencesForSelect(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Forbidden');
    });
  });

  // -----------------------------------------------------------------------
  // useCreateConference
  // -----------------------------------------------------------------------

  describe('useCreateConference', () => {
    const newConferencePayload = {
      name: 'New Conference',
      abbreviation: 'NC26',
      start_date: '2026-09-01',
      end_date: '2026-09-03',
      city: 'Munich',
      country: 'DE',
    };

    const createdConference = {
      ...mockConference,
      id: 'conf-new',
      name: 'New Conference',
      abbreviation: 'NC26',
      start_date: '2026-09-01',
      end_date: '2026-09-03',
      city: 'Munich',
    };

    it('creates a conference via POST /conferences', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: createdConference });

      const { result } = renderHook(() => useCreateConference(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        const response = await result.current.mutateAsync(newConferencePayload);
        expect(response).toEqual(createdConference);
      });

      expect(api.post).toHaveBeenCalledTimes(1);
      expect(api.post).toHaveBeenCalledWith('/conferences', newConferencePayload);
    });

    it('invalidates conference list and stats queries on success', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: createdConference });

      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateConference(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync(newConferencePayload);
      });

      // Verify both invalidation calls
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['conferences'] })
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['conference-stats'] })
      );
    });

    it('invalidates sidebar-conferences query on create success', async () => {
      vi.mocked(api.post).mockResolvedValue({ data: createdConference });

      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateConference(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync(newConferencePayload);
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['sidebar-conferences'] })
      );
    });

    it('returns error state when the mutation fails', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Validation error: name is required'));

      const { result } = renderHook(() => useCreateConference(), {
        wrapper: createWrapper(),
      });

      // Use mutate() (not mutateAsync) so React Query sets isError internally
      act(() => {
        result.current.mutate(newConferencePayload);
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Validation error: name is required');
    });

    it('does not invalidate queries when the mutation fails', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Server error'));

      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateConference(), { wrapper });

      await act(async () => {
        try {
          await result.current.mutateAsync(newConferencePayload);
        } catch {
          // Expected to throw
        }
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Query key isolation
  // -----------------------------------------------------------------------

  describe('query key isolation', () => {
    it('caches useConferenceList with different keys per status filter', async () => {
      const allResponse = { ...mockPaginatedConferences };
      const publishedResponse = {
        ...mockPaginatedConferences,
        items: [mockConference],
        total: 1,
      };

      vi.mocked(api.get)
        .mockResolvedValueOnce({ data: allResponse })
        .mockResolvedValueOnce({ data: publishedResponse });

      const { wrapper, queryClient } = createWrapperWithClient();

      // Render hook without a filter
      const { result: allResult } = renderHook(() => useConferenceList(), {
        wrapper,
      });

      await waitFor(() => {
        expect(allResult.current.isLoading).toBe(false);
      });

      // Render hook with a "published" filter
      const { result: publishedResult } = renderHook(() => useConferenceList('published'), {
        wrapper,
      });

      await waitFor(() => {
        expect(publishedResult.current.isLoading).toBe(false);
      });

      // Both queries should have been made
      expect(api.get).toHaveBeenCalledTimes(2);

      // Verify separate cache entries
      const allCached = queryClient.getQueryData(['conferences', undefined]);
      expect(allCached).toEqual(allResponse);

      const publishedCached = queryClient.getQueryData(['conferences', 'published']);
      expect(publishedCached).toEqual(publishedResponse);
    });

    it('caches useConferenceDetail with different keys per conference ID', async () => {
      vi.mocked(api.get)
        .mockResolvedValueOnce({ data: mockConference })
        .mockResolvedValueOnce({ data: mockConference2 });

      const { wrapper, queryClient } = createWrapperWithClient();

      const { result: result1 } = renderHook(() => useConferenceDetail('conf-1'), { wrapper });

      await waitFor(() => {
        expect(result1.current.isLoading).toBe(false);
      });

      const { result: result2 } = renderHook(() => useConferenceDetail('conf-2'), { wrapper });

      await waitFor(() => {
        expect(result2.current.isLoading).toBe(false);
      });

      expect(api.get).toHaveBeenCalledTimes(2);

      const cached1 = queryClient.getQueryData(['conference', 'conf-1']);
      expect(cached1).toEqual(mockConference);

      const cached2 = queryClient.getQueryData(['conference', 'conf-2']);
      expect(cached2).toEqual(mockConference2);
    });
  });

  // -----------------------------------------------------------------------
  // Error handling across hooks
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('useConferenceList surfaces a 500 server error', async () => {
      const serverError = new Error('Internal Server Error');
      vi.mocked(api.get).mockRejectedValue(serverError);

      const { result } = renderHook(() => useConferenceList(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBe(serverError);
    });

    it('useConferenceDetail surfaces a 404 not found error', async () => {
      const notFoundError = Object.assign(new Error('Not Found'), {
        response: { status: 404, data: { detail: 'Conference not found' } },
      });
      vi.mocked(api.get).mockRejectedValue(notFoundError);

      const { result } = renderHook(() => useConferenceDetail('missing-id'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Not Found');
    });

    it('useConferenceStats surfaces a network error', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Network Error'));

      const { result } = renderHook(() => useConferenceStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Network Error');
    });

    it('useCreateConference surfaces a validation error from the server', async () => {
      const validationError = Object.assign(new Error('Request failed with status code 422'), {
        response: {
          status: 422,
          data: { detail: 'Conference name already exists' },
        },
      });
      vi.mocked(api.post).mockRejectedValue(validationError);

      const { result } = renderHook(() => useCreateConference(), {
        wrapper: createWrapper(),
      });

      // Use mutate() so React Query sets isError internally
      act(() => {
        result.current.mutate({ name: 'Duplicate Name' });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error?.message).toBe('Request failed with status code 422');
    });
  });
});
