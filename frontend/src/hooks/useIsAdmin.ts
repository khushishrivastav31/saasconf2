import { useAuth } from "./useAuth";

export function useIsAdmin(): boolean {
  const { user } = useAuth();
  return user?.role === "super_admin" || user?.role === "tenant_admin";
}
