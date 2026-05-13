import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime, formatTime } from '../formatDate';

describe('formatDate', () => {
  it('formats a date string in medium style', () => {
    const result = formatDate('2026-02-13', 'en');
    expect(result).toContain('Feb');
    expect(result).toContain('2026');
  });

  it('formats a Date object', () => {
    const result = formatDate(new Date('2026-06-01'), 'en');
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty string for null', () => {
    expect(formatDate(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDate(undefined)).toBe('');
  });

  it('uses default locale when not specified', () => {
    const result = formatDate('2026-02-13');
    expect(result).toBeTruthy();
  });

  it('handles German locale', () => {
    const result = formatDate('2026-02-13', 'de');
    expect(result).toContain('2026');
  });

  it('returns string representation for invalid date', () => {
    const result = formatDate('not-a-date', 'en');
    expect(result).toBeTruthy();
  });

  it('treats YYYY-MM-DD as a calendar date, not midnight UTC (QA 1.1.1)', () => {
    // ``new Date("2026-11-20")`` is parsed as midnight UTC, which in any
    // negative-offset zone (America/*) renders as Nov 19. The helper must
    // pin the displayed day to 20 regardless of viewer timezone.
    const result = formatDate('2026-11-20', 'en');
    expect(result).toContain('Nov');
    expect(result).toContain('20');
    expect(result).toContain('2026');
    expect(result).not.toContain('19');
  });

  it('preserves day-of-month for the German locale on date-only input', () => {
    const result = formatDate('2026-11-20', 'de');
    expect(result).toContain('20');
    expect(result).toContain('2026');
  });
});

describe('formatDateTime', () => {
  it('formats a date string with time in medium style', () => {
    const result = formatDateTime('2026-02-13T15:30:00Z', 'en');
    expect(result).toContain('Feb');
    expect(result).toContain('2026');
  });

  it('returns empty string for null', () => {
    expect(formatDateTime(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDateTime(undefined)).toBe('');
  });

  it('formats a Date object with time', () => {
    const result = formatDateTime(new Date('2026-06-01T10:00:00Z'), 'en');
    expect(result).toBeTruthy();
  });

  it('handles invalid date', () => {
    const result = formatDateTime('invalid', 'en');
    expect(result).toBeTruthy();
  });
});

describe('formatTime', () => {
  it('formats time from a date string', () => {
    const result = formatTime('2026-02-13T15:30:00Z', 'en');
    expect(result).toBeTruthy();
  });

  it('returns empty string for null', () => {
    expect(formatTime(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatTime(undefined)).toBe('');
  });

  it('handles invalid date', () => {
    const result = formatTime('invalid', 'en');
    expect(result).toBeTruthy();
  });
});
