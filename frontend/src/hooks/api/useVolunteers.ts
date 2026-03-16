import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import { queryKeys } from '../../config/queryKeys';
import type { VolunteerProfile, VolunteerProfileUpdate, VolunteerRole } from '../../types';

/**
 * Fetch volunteer roles (task types) for a specific conference.
 *
 * Used in task assignment forms to populate the role dropdown.
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
 * Fetch volunteer profiles for a conference.
 */
export function useVolunteerProfiles(conferenceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.volunteers.profiles(conferenceId ?? ''),
    queryFn: async () => {
      const response = await api.get<{ items: VolunteerProfile[]; total: number }>(
        `/conferences/${conferenceId}/volunteer-profiles`
      );
      return response.data;
    },
    enabled: !!conferenceId,
  });
}

/**
 * Mutation to update a volunteer profile.
 */
export function useUpdateVolunteerProfile(conferenceId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      applicantId,
      data,
    }: {
      applicantId: string;
      data: VolunteerProfileUpdate;
    }) => {
      const response = await api.put<VolunteerProfile>(
        `/conferences/${conferenceId}/volunteer-profiles/${applicantId}`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.volunteers.profiles(conferenceId ?? ''),
      });
    },
  });
}
