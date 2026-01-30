/**
 * Phone number validation utilities.
 */

// Phone number pattern: optional + at start, then only digits
const PHONE_PATTERN = /^\+?[0-9]+$/;

/**
 * Validate phone number format.
 * Phone numbers must contain only digits, optionally starting with +.
 * Examples: +491234545, 00491234566
 *
 * @param value - The phone number to validate
 * @returns Error message if invalid, null if valid
 */
export function validatePhone(value: string | null | undefined): string | null {
  if (!value || value === "") {
    return null; // Empty is valid (phone is optional)
  }
  if (!PHONE_PATTERN.test(value)) {
    return "Phone number must contain only digits, optionally starting with +. Examples: +491234545, 00491234566";
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
