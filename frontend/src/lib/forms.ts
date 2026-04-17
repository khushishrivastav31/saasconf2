/**
 * Shared zod helpers for SaaSConf forms.
 *
 * Goal: each form gets ONE schema — the same schema used for field-level
 * validation (via `zodResolver`) and for the initial submit guard. Reusable
 * field-level validators live here so forms don't re-derive the same
 * regex/logic and so we can update rules in one place.
 *
 * All helpers mirror the backend validators in `app/core/validators.py` so
 * the frontend never accepts what the backend would reject.
 */

import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';

// Same regex used by the backend + src/utils/validators.ts
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/** Email zod schema. Optional by default — swap with `.nonempty()` when required. */
export const zEmail = z
  .string()
  .trim()
  .refine((v) => v === '' || EMAIL_RE.test(v), { message: 'Invalid email address format' });

/** Phone zod schema using libphonenumber. Empty is valid (phone is optional). */
export const zPhone = z
  .string()
  .trim()
  .refine((v) => v === '' || isValidPhoneNumber(v), {
    message: 'Invalid phone number. Use international format with country code, e.g. +49123456789',
  });

/** Plain non-empty string. Use for required text fields. */
export const zRequiredString = (label = 'This field') =>
  z
    .string()
    .trim()
    .min(1, { message: `${label} is required` });

/** ISO-2 country code. Empty string coerced to undefined so required forms reject it. */
export const zCountryCode = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}$/i, { message: 'Select a country' })
  .transform((v) => v.toUpperCase());

/**
 * Shortcut for integrating zod with react-hook-form. Wraps
 * `zodResolver` so consumers don't need to know about @hookform/resolvers.
 *
 * Example:
 *   const methods = useForm({ resolver: zResolver(MySchema) });
 */
export { zodResolver as zResolver } from '@hookform/resolvers/zod';
