/**
 * Locale-aware date/time formatting utilities.
 *
 * Uses Intl.DateTimeFormat for proper locale-specific formatting.
 * Pass the conference locale (e.g. "de", "en-US", "es") to get
 * locale-appropriate date formats.
 */

// Date-only ISO string: YYYY-MM-DD with nothing after.
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a date input safely. ``YYYY-MM-DD`` strings are interpreted as
 * **calendar dates** in the browser's local timezone — not midnight UTC.
 *
 * Why this matters: ``new Date("2026-11-20")`` is parsed by the JS engine
 * as ``2026-11-20T00:00:00.000Z`` (midnight UTC) and then displayed in
 * the browser's local timezone. In any negative-offset zone (e.g. the
 * Americas) that displays as ``Nov 19`` — Brandon's QA 1.1.1.
 * For pure calendar dates (no time-of-day in the API), parsing as local
 * time keeps the displayed day stable regardless of viewer timezone.
 */
function toDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  if (DATE_ONLY_RE.test(input)) {
    const [y, m, d] = input.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(input);
}

/**
 * Format a date in medium style (e.g. "Feb 13, 2026" or "13. Feb. 2026").
 */
export function formatDate(date: string | Date | null | undefined, locale = 'en'): string {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(toDate(date));
  } catch {
    return String(date);
  }
}

/**
 * Format a date with time (e.g. "Feb 13, 2026, 3:30 PM").
 */
export function formatDateTime(date: string | Date | null | undefined, locale = 'en'): string {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(toDate(date));
  } catch {
    return String(date);
  }
}

/**
 * Format time only (e.g. "3:30 PM" or "15:30").
 */
export function formatTime(date: string | Date | null | undefined, locale = 'en'): string {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(new Date(date));
  } catch {
    return String(date);
  }
}
