/**
 * Validation utilities for phone numbers and email addresses.
 */

import { isValidPhoneNumber } from 'libphonenumber-js';

// Same regex used by the backend (app/core/validators.py)
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Validate email format.
 *
 * @param value - The email to validate
 * @returns Error message if invalid, null if valid
 */
export function validateEmail(value: string | null | undefined): string | null {
  if (!value || value === '') {
    return null; // Empty is valid (email is optional)
  }
  if (!EMAIL_RE.test(value)) {
    return 'Invalid email address format';
  }
  return null;
}

/**
 * Validate phone number using libphonenumber.
 * Requires international format with country code (e.g. +49123456789).
 *
 * @param value - The phone number to validate
 * @returns Error message if invalid, null if valid
 */
export function validatePhone(value: string | null | undefined): string | null {
  if (!value || value === '') {
    return null; // Empty is valid (phone is optional)
  }
  if (!isValidPhoneNumber(value)) {
    return 'Invalid phone number. Use international format with country code, e.g. +49123456789';
  }
  return null;
}

/**
 * Check if a phone number is valid.
 * @param value - The phone number to check
 * @returns true if valid, false otherwise
 */
export function isValidPhone(value: string | null | undefined): boolean {
  return validatePhone(value) === null;
}

// Hostname regex: valid domain with TLD (same logic as backend)
const HOSTNAME_RE =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

/**
 * Validate a website URL. Accepts URLs with or without a scheme.
 *
 * @param value - The website URL to validate
 * @returns Error message if invalid, null if valid
 */
export function validateWebsite(value: string | null | undefined): string | null {
  if (!value || value.trim() === '') {
    return null; // Empty is valid (website is optional)
  }
  let url = value.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    if (!HOSTNAME_RE.test(parsed.hostname)) {
      return 'Invalid website URL. Provide a valid domain, e.g. example.com';
    }
  } catch {
    return 'Invalid website URL. Provide a valid domain, e.g. example.com';
  }
  return null;
}

/**
 * Normalize a URL by prepending https:// if no protocol is present.
 * Allows users to type "example.com" and get "https://example.com".
 *
 * @param value - The URL string to normalize
 * @returns Normalized URL with protocol, or empty string if blank
 */
export function normalizeUrl(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// Character replacements for German umlauts, ligatures, and common diacritics.
// Applied before general transliteration so they produce the expected multi-char
// expansions (e.g. ö → oe) rather than being stripped or reduced to "o".
const CHAR_MAP: Record<string, string> = {
  ä: 'ae',
  ö: 'oe',
  ü: 'ue',
  ß: 'ss',
  Ä: 'Ae',
  Ö: 'Oe',
  Ü: 'Ue',
  à: 'a',
  á: 'a',
  â: 'a',
  ã: 'a',
  å: 'a',
  è: 'e',
  é: 'e',
  ê: 'e',
  ë: 'e',
  ì: 'i',
  í: 'i',
  î: 'i',
  ï: 'i',
  ò: 'o',
  ó: 'o',
  ô: 'o',
  õ: 'o',
  ù: 'u',
  ú: 'u',
  û: 'u',
  ñ: 'n',
  ç: 'c',
  ý: 'y',
  ÿ: 'y',
  ð: 'd',
  þ: 'th',
  ø: 'o',
  æ: 'ae',
  À: 'A',
  Á: 'A',
  Â: 'A',
  Ã: 'A',
  Å: 'A',
  È: 'E',
  É: 'E',
  Ê: 'E',
  Ë: 'E',
  Ì: 'I',
  Í: 'I',
  Î: 'I',
  Ï: 'I',
  Ò: 'O',
  Ó: 'O',
  Ô: 'O',
  Õ: 'O',
  Ù: 'U',
  Ú: 'U',
  Û: 'U',
  Ñ: 'N',
  Ç: 'C',
  Ý: 'Y',
  Ð: 'D',
  Þ: 'Th',
  Ø: 'O',
  Æ: 'Ae',
};

/**
 * Replace known special characters (umlauts, diacritics) with ASCII equivalents.
 */
function transliterate(str: string): string {
  return str.replace(/[^\x20-\x7E]/g, (ch) => CHAR_MAP[ch] ?? '');
}

/**
 * Generate a hyphen-separated slug from a name.
 * Handles German umlauts (ö→oe, ü→ue, ä→ae, ß→ss) and other diacritics.
 *
 * Example: "Große Halle" → "grosse-halle"
 */
export function slugifyHyphen(name: string): string {
  return transliterate(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate an underscore-separated slug from a name.
 * Handles German umlauts (ö→oe, ü→ue, ä→ae, ß→ss) and other diacritics.
 * Must start with a letter.
 *
 * Example: "Große Halle" → "grosse_halle"
 */
export function slugifyUnderscore(name: string): string {
  return transliterate(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^[^a-z]/, '')
    .replace(/_+/g, '_')
    .replace(/_$/, '');
}
