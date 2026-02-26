import { describe, it, expect } from 'vitest';
import { validatePhone, isValidPhone, validateEmail, normalizeUrl } from '../validators';

describe('validatePhone', () => {
  it('returns null for empty string (optional field)', () => {
    expect(validatePhone('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(validatePhone(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(validatePhone(undefined)).toBeNull();
  });

  it('accepts valid international number with +', () => {
    expect(validatePhone('+491701234567')).toBeNull();
  });

  it('accepts valid US number', () => {
    expect(validatePhone('+12025551234')).toBeNull();
  });

  it('accepts number with spaces (libphonenumber parses them)', () => {
    expect(validatePhone('+49 170 123 4567')).toBeNull();
  });

  it('accepts number with dashes (libphonenumber parses them)', () => {
    expect(validatePhone('+1-202-555-1234')).toBeNull();
  });

  it('rejects number without country code', () => {
    expect(validatePhone('1234567890')).not.toBeNull();
  });

  it('rejects 00-prefix numbers (requires + prefix)', () => {
    expect(validatePhone('00491234566')).not.toBeNull();
  });

  it('rejects letters', () => {
    expect(validatePhone('abc123')).not.toBeNull();
  });

  it('rejects too-short numbers', () => {
    expect(validatePhone('+49123')).not.toBeNull();
  });

  it('returns a descriptive error message', () => {
    const result = validatePhone('bad-phone');
    expect(result).toContain('Invalid phone number');
  });
});

describe('isValidPhone', () => {
  it('returns true for valid phone numbers', () => {
    expect(isValidPhone('+491701234567')).toBe(true);
    expect(isValidPhone('+12025551234')).toBe(true);
    expect(isValidPhone('')).toBe(true);
    expect(isValidPhone(null)).toBe(true);
  });

  it('returns false for invalid phone numbers', () => {
    expect(isValidPhone('abc')).toBe(false);
    expect(isValidPhone('00491234566')).toBe(false);
    expect(isValidPhone('+49123')).toBe(false);
  });
});

describe('validateEmail', () => {
  it('returns null for empty string (optional field)', () => {
    expect(validateEmail('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(validateEmail(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(validateEmail(undefined)).toBeNull();
  });

  it('accepts valid email', () => {
    expect(validateEmail('user@example.com')).toBeNull();
  });

  it('accepts email with dots and plus', () => {
    expect(validateEmail('first.last+tag@example.co.uk')).toBeNull();
  });

  it('accepts email with numbers', () => {
    expect(validateEmail('user123@test456.org')).toBeNull();
  });

  it('rejects email without @', () => {
    expect(validateEmail('userexample.com')).not.toBeNull();
  });

  it('rejects email without domain', () => {
    expect(validateEmail('user@')).not.toBeNull();
  });

  it('rejects email without TLD', () => {
    expect(validateEmail('user@example')).not.toBeNull();
  });

  it('rejects email with spaces', () => {
    expect(validateEmail('user @example.com')).not.toBeNull();
  });

  it('returns a descriptive error message', () => {
    const result = validateEmail('bad-email');
    expect(result).toContain('Invalid email');
  });
});

describe('normalizeUrl', () => {
  it('returns empty string for null', () => {
    expect(normalizeUrl(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(normalizeUrl(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(normalizeUrl('')).toBe('');
  });

  it('returns empty string for whitespace-only', () => {
    expect(normalizeUrl('   ')).toBe('');
  });

  it('prepends https:// when no protocol', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
  });

  it('preserves existing https://', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
  });

  it('preserves existing http://', () => {
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('handles HTTPS with mixed case', () => {
    expect(normalizeUrl('HTTPS://Example.Com')).toBe('HTTPS://Example.Com');
  });

  it('trims whitespace before normalizing', () => {
    expect(normalizeUrl('  example.com  ')).toBe('https://example.com');
  });

  it('handles URL with path', () => {
    expect(normalizeUrl('example.com/path')).toBe('https://example.com/path');
  });
});
