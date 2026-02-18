import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import { queryKeys } from '../../config/queryKeys';
import type { Conference, ConferenceCreate, ConferenceStats, PaginatedResponse } from '../../types';

/**
 * Fetch a paginated, optionally filtered list of conferences.
 *
 * Used on the Conferences page and anywhere a full conference list with
 * pagination metadata is needed.
 */
export function useConferenceList(statusFilter?: string) {
  return useQuery({
    queryKey: queryKeys.conferences.list(statusFilter),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      const response = await api.get<PaginatedResponse<Conference>>(`/conferences?${params}`);
      return response.data;
    },
  });
}

/**
 * Fetch a single conference by ID.
 *
 * The query is disabled when `conferenceId` is falsy, which is common
 * when the ID is parsed from route params and may not yet be available.
 */
export function useConferenceDetail(conferenceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conferences.detail(conferenceId),
    queryFn: async () => {
      const response = await api.get<Conference>(`/conferences/${conferenceId}`);
      return response.data;
    },
    enabled: !!conferenceId,
  });
}

/**
 * Fetch aggregate conference statistics (total, upcoming, ongoing, past).
 */
export function useConferenceStats() {
  return useQuery({
    queryKey: queryKeys.conferences.stats,
    queryFn: async () => {
      const response = await api.get<ConferenceStats>('/conferences/stats');
      return response.data;
    },
  });
}

/**
 * Fetch all conferences as a flat list suitable for <select> dropdowns.
 *
 * Requests page_size=100 to retrieve all conferences in a single page.
 * This is the most duplicated conference query in the codebase (5+ places).
 */
export function useConferencesForSelect() {
  return useQuery({
    queryKey: queryKeys.conferences.forSelect,
    queryFn: async () => {
      const response = await api.get<PaginatedResponse<Conference>>('/conferences?page_size=100');
      return response.data;
    },
  });
}

/**
 * Mutation to create a new conference.
 *
 * Automatically invalidates the conference list and stats queries on success.
 */
export function useCreateConference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ConferenceCreate) => {
      const response = await api.post<Conference>('/conferences', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conferences.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.conferences.stats });
    },
  });
}
