/**
 * Registration Submission Hook
 *
 * Handles public registration submission with security measures.
 */
import { useMutation } from '@tanstack/react-query';
import publicApi from '../../../config/publicApi';
import type {
  PortalRegistrationRequest,
  PortalRegistrationResponse,
} from '../../../types/publicRegistration';

export function useRegistrationSubmit(tenantSlug: string, conferenceSlug: string) {
  return useMutation({
    mutationFn: async (request: PortalRegistrationRequest): Promise<PortalRegistrationResponse> => {
      const { data } = await publicApi.post(
        `/portal/${tenantSlug}/conferences/${conferenceSlug}/register`,
        request
      );
      return data;
    },
  });
}
