/**
 * Parse an API error into a user-friendly message string.
 *
 * Handles:
 * - Axios-style errors with `response.data.detail` (string or validation array)
 * - Generic Error objects
 * - Unknown thrown values
 */
export function parseApiError(
  error: unknown,
  fallback = "An unexpected error occurred",
): string {
  if (error && typeof error === "object" && "response" in error) {
    const axiosError = error as {
      response?: { data?: { detail?: unknown } };
    };
    const detail = axiosError.response?.data?.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      return detail
        .map((d: { msg?: string }) => d.msg || "Validation error")
        .join(", ");
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
