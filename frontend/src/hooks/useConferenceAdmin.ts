import { useQuery } from "@tanstack/react-query";
import api from "../config/api";
import { useAuth } from "./useAuth";

interface ConferenceAccessResponse {
  has_access: boolean;
  access_level: string;
  is_conference_admin: boolean;
}

/**
 * Hook to check if the current user has admin access to a specific conference.
 *
 * This considers:
 * 1. Super admin role (always admin)
 * 2. Tenant admin role (always admin)
 * 3. Conference-specific admin access granted via UserConferenceAccess
 *
 * @param conferenceId - The conference ID to check access for
 * @returns Object with isAdmin boolean and loading state
 */
export function useConferenceAdmin(conferenceId: string | undefined): {
  isAdmin: boolean;
  isLoading: boolean;
  accessLevel: string | null;
} {
  const { user } = useAuth();

  // Quick check: if user is super_admin or tenant_admin, they're always admin
  const isTenantAdmin =
    user?.role === "super_admin" || user?.role === "tenant_admin";

  const { data, isLoading } = useQuery({
    queryKey: ["conference-access", conferenceId, user?.id],
    queryFn: async () => {
      const response = await api.get<ConferenceAccessResponse>(
        `/user-conference-access/my-access/${conferenceId}`
      );
      return response.data;
    },
    enabled: !!conferenceId && !!user && !isTenantAdmin,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // If user is tenant admin, they're always admin
  if (isTenantAdmin) {
    return {
      isAdmin: true,
      isLoading: false,
      accessLevel: "admin",
    };
  }

  return {
    isAdmin: data?.is_conference_admin ?? false,
    isLoading: isLoading && !!conferenceId,
    accessLevel: data?.access_level ?? null,
  };
}
