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
 * 1. Super admin role (read-only access - can view but not modify tenant data)
 * 2. Tenant admin role (always admin - can modify their tenant's data)
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

  // Super admins have read-only access to tenant data
  const isSuperAdmin = user?.role === "super_admin";
  // Tenant admins can manage their tenant's data
  const isTenantAdmin = user?.role === "tenant_admin";

  const { data, isLoading } = useQuery({
    queryKey: ["conference-access", conferenceId, user?.id],
    queryFn: async () => {
      const response = await api.get<ConferenceAccessResponse>(
        `/user-conference-access/my-access/${conferenceId}`
      );
      return response.data;
    },
    // Skip query for super admins (read-only) and tenant admins (always admin)
    enabled: !!conferenceId && !!user && !isSuperAdmin && !isTenantAdmin,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Super admins can view but NOT modify tenant data
  if (isSuperAdmin) {
    return {
      isAdmin: false,
      isLoading: false,
      accessLevel: "read_only",
    };
  }

  // Tenant admins are always admin for their conferences
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
