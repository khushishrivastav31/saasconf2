import { useQuery } from '@tanstack/react-query';
import publicApi from '../../../config/publicApi';
import type { BookableSessionsResponse } from '../../../types/registration';

/**
 * Fetch bookable sessions for a booking option in public registration portal.
 *
 * @param tenantSlug - Tenant slug from URL
 * @param conferenceSlug - Conference slug from URL
 * @param optionId - Booking option ID
 * @param enabled - Whether to enable the query (default: true)
 */
export function useBookableSessions(
  tenantSlug: string,
  conferenceSlug: string,
  optionId: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ['portal-bookable-sessions', tenantSlug, conferenceSlug, optionId],
    queryFn: async () => {
      const response = await publicApi.get<BookableSessionsResponse>(
        `/portal/${tenantSlug}/conferences/${conferenceSlug}/bookable-sessions/${optionId}`
      );
      return response.data;
    },
    enabled,
    staleTime: 60000, // 1 minute cache
  });
}
