/**
 * Locale-aware date/time formatting utilities.
 *
 * Uses Intl.DateTimeFormat for proper locale-specific formatting.
 * Pass the conference locale (e.g. "de", "en-US", "es") to get
 * locale-appropriate date formats.
 */

/**
 * Format a date in medium style (e.g. "Feb 13, 2026" or "13. Feb. 2026").
 */
export function formatDate(
  date: string | Date | null | undefined,
  locale = "en",
): string {
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
      new Date(date),
    );
  } catch {
    return String(date);
  }
}

/**
 * Format a date with time (e.g. "Feb 13, 2026, 3:30 PM").
 */
export function formatDateTime(
  date: string | Date | null | undefined,
  locale = "en",
): string {
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(date));
  } catch {
    return String(date);
  }
}

/**
 * Format time only (e.g. "3:30 PM" or "15:30").
 */
export function formatTime(
  date: string | Date | null | undefined,
  locale = "en",
): string {
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(
      new Date(date),
    );
  } catch {
    return String(date);
  }
}
