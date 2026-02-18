import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import { queryKeys } from '../../config/queryKeys';
import type {
  Volunteer,
  VolunteerCreate,
  VolunteerUpdate,
  VolunteerStats,
  VolunteerRole,
  PaginatedResponse,
} from '../../types';

/**
 * Fetch a paginated, optionally filtered list of volunteers.
 */
export function useVolunteerList(statusFilter?: string) {
  return useQuery({
    queryKey: queryKeys.volunteers.list(statusFilter),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const response = await api.get<PaginatedResponse<Volunteer>>(`/volunteers?${params}`);
      return response.data;
    },
  });
}

/**
 * Fetch aggregate volunteer statistics.
 */
export function useVolunteerStats() {
  return useQuery({
    queryKey: queryKeys.volunteers.stats,
    queryFn: async () => {
      const response = await api.get<VolunteerStats>('/volunteers/stats');
      return response.data;
    },
  });
}

/**
 * Fetch volunteer roles for a specific conference.
 *
 * Used in volunteer create/edit forms to populate the role dropdown.
 * The query is disabled when `conferenceId` is falsy.
 */
export function useVolunteerRoles(conferenceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.volunteers.roles(conferenceId ?? ''),
    queryFn: async () => {
      const response = await api.get<{ items: VolunteerRole[]; total: number }>(
        `/conferences/${conferenceId}/settings/volunteer-roles`
      );
      return response.data;
    },
    enabled: !!conferenceId,
  });
}

/**
 * Mutation to create a new volunteer.
 *
 * Invalidates volunteer list and stats on success.
 */
export function useCreateVolunteer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: VolunteerCreate) => {
      const response = await api.post<Volunteer>('/volunteers', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers.allList });
    },
  });
}

/**
 * Mutation to update an existing volunteer.
 *
 * Invalidates volunteer list and stats on success.
 */
export function useUpdateVolunteer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: VolunteerUpdate }) => {
      const response = await api.put<Volunteer>(`/volunteers/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers.allList });
    },
  });
}

/**
 * Mutation to delete a volunteer.
 *
 * Invalidates volunteer list and stats on success.
 */
export function useDeleteVolunteer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/volunteers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers.stats });
      queryClient.invalidateQueries({ queryKey: queryKeys.volunteers.allList });
    },
  });
}
