import { describe, it, expect } from 'vitest';
import { zEmail, zPhone, zRequiredString, zCountryCode } from '../forms';

describe('zEmail', () => {
  it('accepts empty string (optional field)', () => {
    expect(zEmail.safeParse('').success).toBe(true);
  });
  it('accepts a valid email', () => {
    expect(zEmail.safeParse('jose@example.com').success).toBe(true);
  });
  it('rejects a malformed email', () => {
    expect(zEmail.safeParse('not-an-email').success).toBe(false);
  });
});

describe('zPhone', () => {
  it('accepts empty string', () => {
    expect(zPhone.safeParse('').success).toBe(true);
  });
  it('accepts an international phone number', () => {
    expect(zPhone.safeParse('+491701234567').success).toBe(true);
  });
  it('rejects a phone number without country code', () => {
    expect(zPhone.safeParse('5551234').success).toBe(false);
  });
});

describe('zRequiredString', () => {
  it('rejects empty', () => {
    const r = zRequiredString('Name').safeParse('   ');
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe('Name is required');
    }
  });
  it('accepts non-empty with trimming', () => {
    expect(zRequiredString('Name').parse('  Jose  ')).toBe('Jose');
  });
});

describe('zCountryCode', () => {
  it('uppercases ISO-2 code', () => {
    expect(zCountryCode.parse('de')).toBe('DE');
  });
  it('rejects non-ISO-2', () => {
    expect(zCountryCode.safeParse('DEU').success).toBe(false);
    expect(zCountryCode.safeParse('').success).toBe(false);
  });
});
