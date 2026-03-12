/**
 * Public Conference Data Hook
 *
 * Fetches conference details for public registration portal (no auth required).
 */
import { useQuery } from '@tanstack/react-query';
import publicApi from '../../../config/publicApi';
import type { PublicConference } from '../../../types/publicRegistration';

export function useConferencePublic(tenantSlug: string, conferenceSlug: string) {
  return useQuery({
    queryKey: ['public-conference', tenantSlug, conferenceSlug],
    queryFn: async (): Promise<PublicConference> => {
      const { data } = await publicApi.get(`/portal/${tenantSlug}/conferences/${conferenceSlug}`);
      return data;
    },
    enabled: Boolean(tenantSlug && conferenceSlug),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // 404/403 responses should not be retried — conference either exists or not
  });
}
