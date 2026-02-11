import { useAuth } from "./useAuth";

/**
 * Returns true if the user is a tenant admin (can manage their tenant's data).
 * Super admins are NOT tenant admins - they can only VIEW tenant data.
 */
export function useIsTenantAdmin(): boolean {
  const { user } = useAuth();
  return user?.role === "tenant_admin";
}

/**
 * Returns true if the user is a SaaS super admin (platform-level admin).
 * Super admins can view all tenant data but cannot modify it.
 */
export function useIsSuperAdmin(): boolean {
  const { user } = useAuth();
  return user?.role === "super_admin";
}

/**
 * Returns true if the user has any admin role (super_admin or tenant_admin).
 * Use useIsTenantAdmin() when you need to check for tenant data modification rights.
 */
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  return user?.role === "super_admin" || user?.role === "tenant_admin";
}
