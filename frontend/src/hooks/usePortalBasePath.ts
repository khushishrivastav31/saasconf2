import { useParams } from "react-router-dom";

/**
 * Returns the base path for portal routes: `/${companySlug}/portal`.
 * Must be used inside a route that has `:companySlug` in its path.
 */
export function usePortalBasePath(): string {
  const { companySlug } = useParams<{ companySlug: string }>();
  if (!companySlug) {
    throw new Error(
      "usePortalBasePath must be used inside a route with :companySlug",
    );
  }
  return `/${companySlug}/portal`;
}
