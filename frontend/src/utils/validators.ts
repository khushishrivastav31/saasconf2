/**
 * Phone number validation utilities using libphonenumber-js.
 */

import { isValidPhoneNumber } from "libphonenumber-js";

/**
 * Validate phone number using libphonenumber.
 * Requires international format with country code (e.g. +49123456789).
 *
 * @param value - The phone number to validate
 * @returns Error message if invalid, null if valid
 */
export function validatePhone(value: string | null | undefined): string | null {
  if (!value || value === "") {
    return null; // Empty is valid (phone is optional)
  }
  if (!isValidPhoneNumber(value)) {
    return "Invalid phone number. Use international format with country code, e.g. +49123456789";
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
