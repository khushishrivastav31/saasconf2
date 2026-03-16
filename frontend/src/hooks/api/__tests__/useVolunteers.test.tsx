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
  useVolunteerRoles,
  useVolunteerProfiles,
  useUpdateVolunteerProfile,
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

// Helper that returns both the wrapper and the queryClient
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

      expect(result.current.isLoading).toBe(false);
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

  // ── useVolunteerProfiles ──────────────────────────────────────────────

  describe('useVolunteerProfiles', () => {
    it('fetches volunteer profiles for a conference', async () => {
      const mockProfiles = {
        items: [
          {
            id: 'p1',
            applicant_id: 'a1',
            first_name: 'Alice',
            last_name: 'Smith',
            email: 'alice@test.com',
            color: '#3B82F6',
          },
        ],
        total: 1,
      };

      vi.mocked(api.get).mockResolvedValue({ data: mockProfiles });

      const { result } = renderHook(() => useVolunteerProfiles('conf-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockProfiles);
      expect(api.get).toHaveBeenCalledWith('/conferences/conf-123/volunteer-profiles');
    });

    it('does not fetch when conferenceId is undefined', async () => {
      const { result } = renderHook(() => useVolunteerProfiles(undefined), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.fetchStatus).toBe('idle');
      expect(api.get).not.toHaveBeenCalled();
    });

    it('returns error state when the request fails', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Server error'));

      const { result } = renderHook(() => useVolunteerProfiles('conf-123'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Server error');
    });
  });

  // ── useUpdateVolunteerProfile ─────────────────────────────────────────

  describe('useUpdateVolunteerProfile', () => {
    it('updates a volunteer profile and invalidates queries', async () => {
      const updatedProfile = {
        id: 'p1',
        applicant_id: 'a1',
        first_name: 'Alice',
        last_name: 'Smith',
        tshirt_size: 'XL',
        color: '#EF4444',
      };

      vi.mocked(api.put).mockResolvedValue({ data: updatedProfile });
      vi.mocked(api.get).mockResolvedValue({ data: { items: [], total: 0 } });

      const { wrapper, queryClient } = createWrapperWithClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateVolunteerProfile('conf-123'), { wrapper });

      await act(async () => {
        const data = await result.current.mutateAsync({
          applicantId: 'a1',
          data: { tshirt_size: 'XL', color: '#EF4444' },
        });
        expect(data).toEqual(updatedProfile);
      });

      expect(api.put).toHaveBeenCalledWith('/conferences/conf-123/volunteer-profiles/a1', {
        tshirt_size: 'XL',
        color: '#EF4444',
      });

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['volunteer-profiles', 'conf-123'] })
      );
    });

    it('propagates error when update fails', async () => {
      const apiError = new Error('Not found');
      vi.mocked(api.put).mockRejectedValue(apiError);

      const { result } = renderHook(() => useUpdateVolunteerProfile('conf-123'), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.mutate({
          applicantId: 'nonexistent',
          data: { tshirt_size: 'M' },
        });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBe(apiError);
    });
  });
});
