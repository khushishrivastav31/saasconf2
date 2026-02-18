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
  useVolunteerList,
  useVolunteerStats,
  useVolunteerRoles,
  useCreateVolunteer,
  useUpdateVolunteer,
  useDeleteVolunteer,
} from '../useVolunteers';

// Helper to create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

// Wrapper component that provides QueryClient
function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Helper that returns both the wrapper and the queryClient so tests can
// inspect the cache directly (e.g. to verify invalidation).
function createWrapperWithClient() {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

describe('useVolunteers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ── useVolunteerList ────────────────────────────────────────────────

  describe('useVolunteerList', () => {
    it('fetches volunteers with a status filter', async () => {
      const mockData = {
        items: [
          { id: 'v1', name: 'Alice', status: 'active' },
          { id: 'v2', name: 'Bob', status: 'active' },
        ],
        total: 2,
      };

      vi.mocked(api.get).mockResolvedValue({ data: mockData });

      const { result } = renderHook(() => useVolunteerList('active'), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(api.get).toHaveBeenCalledWith('/volunteers?status=active');
    });

    it('fetches volunteers without a filter', async () => {
      const mockData = {
        items: [
          { id: 'v1', name: 'Alice', status: 'active' },
          { id: 'v2', name: 'Bob', status: 'inactive' },
        ],
        total: 2,
      };

      vi.mocked(api.get).mockResolvedValue({ data: mockData });

      const { result } = renderHook(() => useVolunteerList(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      // When no filter is provided the URLSearchParams will be empty
      expect(api.get).toHaveBeenCalledWith('/volunteers?');
    });

    it('returns error state when the request fails', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useVolunteerList('active'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Network error');
    });
  });

  // ── useVolunteerStats ───────────────────────────────────────────────

  describe('useVolunteerStats', () => {
    it('fetches volunteer statistics', async () => {
      const mockStats = {
        total: 42,
        active: 30,
        inactive: 12,
        by_conference: [
          { conference_id: 'c1', name: 'Conf A', count: 20 },
          { conference_id: 'c2', name: 'Conf B', count: 22 },
        ],
      };

      vi.mocked(api.get).mockResolvedValue({ data: mockStats });

      const { result } = renderHook(() => useVolunteerStats(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockStats);
      expect(api.get).toHaveBeenCalledWith('/volunteers/stats');
    });

    it('returns error state when the request fails', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Server error'));

      const { result } = renderHook(() => useVolunteerStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Server error');
    });
  });

  // ── useVolunteerRoles ───────────────────────────────────────────────

  describe('useVolunteerRoles', () => {
    it('fetches roles for a given conference', async () => {
      const mockRoles = {
        items: [
          { id: 'r1', name: 'Stage Manager' },
          { id: 'r2', name: 'Registration Desk' },
        ],
        total: 2,
      };

      vi.mocked(api.get).mockResolvedValue({ data: mockRoles });

      const { result } = renderHook(() => useVolunteerRoles('conf-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockRoles);
      expect(api.get).toHaveBeenCalledWith('/conferences/conf-123/settings/volunteer-roles');
    });

    it('does not fetch when conferenceId is undefined', async () => {
      const { result } = renderHook(() => useVolunteerRoles(undefined), {
        wrapper: createWrapper(),
      });

      // The query should never start loading because it is disabled
      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe('idle');
      expect(api.get).not.toHaveBeenCalled();
    });

    it('does not fetch when conferenceId is an empty string', async () => {
      const { result } = renderHook(() => useVolunteerRoles('' as string | undefined), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(api.get).not.toHaveBeenCalled();
    });

    it('returns error state when the request fails', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Forbidden'));

      const { result } = renderHook(() => useVolunteerRoles('conf-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Forbidden');
    });
  });

  // ── useCreateVolunteer ──────────────────────────────────────────────

  describe('useCreateVolunteer', () => {
    it('creates a volunteer and invalidates related queries', async () => {
      const newVolunteer = { id: 'v-new', name: 'Charlie', status: 'active' };

      vi.mocked(api.post).mockResolvedValue({ data: newVolunteer });
      // Provide a response for any refetch triggered by invalidation
      vi.mocked(api.get).mockResolvedValue({ data: { items: [], total: 0 } });

      const { wrapper, queryClient } = createWrapperWithClient();

      // Seed the cache with data so we can observe invalidation
      queryClient.setQueryData(['volunteers'], { items: [], total: 0 });
      queryClient.setQueryData(['volunteer-stats'], { total: 0 });
      queryClient.setQueryData(['all-volunteers'], { items: [], total: 0 });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateVolunteer(), { wrapper });

      await act(async () => {
        const data = await result.current.mutateAsync({
          name: 'Charlie',
          email: 'charlie@example.com',
        } as never);
        expect(data).toEqual(newVolunteer);
      });

      expect(api.post).toHaveBeenCalledWith('/volunteers', {
        name: 'Charlie',
        email: 'charlie@example.com',
      });

      // Verify cache invalidation calls
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['volunteers'] })
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['volunteer-stats'] })
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['all-volunteers'] })
      );
    });

    it('propagates error when creation fails', async () => {
      const apiError = new Error('Validation error');
      vi.mocked(api.post).mockRejectedValue(apiError);

      const { result } = renderHook(() => useCreateVolunteer(), {
        wrapper: createWrapper(),
      });

      // Use mutate() so React Query sets isError internally
      act(() => {
        result.current.mutate({
          name: 'Bad Data',
        } as never);
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBe(apiError);
    });
  });

  // ── useUpdateVolunteer ──────────────────────────────────────────────

  describe('useUpdateVolunteer', () => {
    it('updates a volunteer and invalidates related queries', async () => {
      const updated = { id: 'v1', name: 'Alice Updated', status: 'active' };

      vi.mocked(api.put).mockResolvedValue({ data: updated });
      vi.mocked(api.get).mockResolvedValue({ data: { items: [], total: 0 } });

      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['volunteers'], { items: [], total: 0 });
      queryClient.setQueryData(['volunteer-stats'], { total: 1 });
      queryClient.setQueryData(['all-volunteers'], { items: [], total: 0 });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateVolunteer(), { wrapper });

      await act(async () => {
        const data = await result.current.mutateAsync({
          id: 'v1',
          data: { name: 'Alice Updated' } as never,
        });
        expect(data).toEqual(updated);
      });

      expect(api.put).toHaveBeenCalledWith('/volunteers/v1', {
        name: 'Alice Updated',
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['volunteers'] })
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['volunteer-stats'] })
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['all-volunteers'] })
      );
    });

    it('propagates error when update fails', async () => {
      const apiError = new Error('Not found');
      vi.mocked(api.put).mockRejectedValue(apiError);

      const { result } = renderHook(() => useUpdateVolunteer(), {
        wrapper: createWrapper(),
      });

      // Use mutate() so React Query sets isError internally
      act(() => {
        result.current.mutate({
          id: 'nonexistent',
          data: { name: 'Nope' } as never,
        });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBe(apiError);
    });
  });

  // ── useDeleteVolunteer ──────────────────────────────────────────────

  describe('useDeleteVolunteer', () => {
    it('deletes a volunteer and invalidates related queries', async () => {
      vi.mocked(api.delete).mockResolvedValue({});
      vi.mocked(api.get).mockResolvedValue({ data: { items: [], total: 0 } });

      const { wrapper, queryClient } = createWrapperWithClient();

      queryClient.setQueryData(['volunteers'], {
        items: [{ id: 'v1', name: 'Alice' }],
        total: 1,
      });
      queryClient.setQueryData(['volunteer-stats'], { total: 1 });
      queryClient.setQueryData(['all-volunteers'], {
        items: [{ id: 'v1', name: 'Alice' }],
        total: 1,
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteVolunteer(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync('v1');
      });

      expect(api.delete).toHaveBeenCalledWith('/volunteers/v1');

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['volunteers'] })
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['volunteer-stats'] })
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['all-volunteers'] })
      );
    });

    it('propagates error when deletion fails', async () => {
      const apiError = new Error('Cannot delete: volunteer is assigned');
      vi.mocked(api.delete).mockRejectedValue(apiError);

      const { result } = renderHook(() => useDeleteVolunteer(), {
        wrapper: createWrapper(),
      });

      // Use mutate() so React Query sets isError internally
      act(() => {
        result.current.mutate('v1');
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBe(apiError);
    });
  });

  // ── Error handling (cross-cutting) ──────────────────────────────────

  describe('error handling', () => {
    it('useVolunteerList handles axios-style error objects', async () => {
      const axiosError = {
        response: { status: 500, data: { detail: 'Internal server error' } },
        message: 'Request failed with status code 500',
      };
      vi.mocked(api.get).mockRejectedValue(axiosError);

      const { result } = renderHook(() => useVolunteerList(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBe(axiosError);
    });

    it('useVolunteerStats handles 403 forbidden', async () => {
      const forbiddenError = {
        response: { status: 403, data: { detail: 'Not authorized' } },
        message: 'Request failed with status code 403',
      };
      vi.mocked(api.get).mockRejectedValue(forbiddenError);

      const { result } = renderHook(() => useVolunteerStats(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBe(forbiddenError);
    });

    it('mutation error does not affect unrelated queries', async () => {
      // Stats query succeeds
      const mockStats = { total: 5, active: 3, inactive: 2 };
      vi.mocked(api.get).mockResolvedValue({ data: mockStats });

      // Create mutation fails
      vi.mocked(api.post).mockRejectedValue(new Error('Create failed'));

      const { wrapper } = createWrapperWithClient();

      const statsHook = renderHook(() => useVolunteerStats(), { wrapper });
      const createHook = renderHook(() => useCreateVolunteer(), { wrapper });

      await waitFor(() => {
        expect(statsHook.result.current.isLoading).toBe(false);
      });

      // Stats loaded successfully
      expect(statsHook.result.current.data).toEqual(mockStats);
      expect(statsHook.result.current.isError).toBe(false);

      // Mutation fails — use mutate() so React Query sets isError internally
      act(() => {
        createHook.result.current.mutate({
          name: 'Fail',
        } as never);
      });

      await waitFor(() => {
        expect(createHook.result.current.isError).toBe(true);
      });

      // Stats query is still fine
      expect(statsHook.result.current.isError).toBe(false);
      expect(statsHook.result.current.data).toEqual(mockStats);
    });
  });
});
