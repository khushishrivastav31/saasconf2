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
