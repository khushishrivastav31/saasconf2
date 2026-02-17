/**
 * Currency formatting utilities with automatic per-currency formatting.
 *
 * Each currency has a standard regional format (decimal separator,
 * thousands separator, symbol position, decimal places).
 */

/**
 * Number formatting options.
 */
export interface NumberFormatOptions {
  decimalSeparator: string; // "." or ","
  thousandsSeparator: string; // ",", ".", " ", "'", or ""
  currencyPosition: 'before' | 'after';
  decimalPlaces: number; // 0-4
}

/**
 * Default formatting options (US/UK style).
 */
export const defaultNumberFormat: NumberFormatOptions = {
  decimalSeparator: '.',
  thousandsSeparator: ',',
  currencyPosition: 'before',
  decimalPlaces: 2,
};

/**
 * Standard number formats for currencies.
 * Based on ISO 4217 currency codes and regional conventions.
 */
export const CURRENCY_FORMATS: Record<string, NumberFormatOptions> = {
  // European - comma decimal, period/space thousands, symbol after
  EUR: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    decimalPlaces: 2,
  },
  CHF: {
    decimalSeparator: ',',
    thousandsSeparator: "'",
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  SEK: {
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    decimalPlaces: 2,
  },
  NOK: {
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    decimalPlaces: 2,
  },
  DKK: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    decimalPlaces: 2,
  },
  PLN: {
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    decimalPlaces: 2,
  },
  CZK: {
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    decimalPlaces: 2,
  },
  HUF: {
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    decimalPlaces: 0,
  },
  RON: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    decimalPlaces: 2,
  },
  BGN: {
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    decimalPlaces: 2,
  },
  HRK: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    decimalPlaces: 2,
  },
  RSD: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    decimalPlaces: 2,
  },

  // Anglo-Saxon - period decimal, comma thousands, symbol before
  USD: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  GBP: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  CAD: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  AUD: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  NZD: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  SGD: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  HKD: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  ZAR: {
    decimalSeparator: '.',
    thousandsSeparator: ' ',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },

  // Asian
  JPY: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 0,
  },
  CNY: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  KRW: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 0,
  },
  INR: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  THB: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  MYR: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  IDR: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'before',
    decimalPlaces: 0,
  },
  PHP: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  VND: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    decimalPlaces: 0,
  },

  // Latin America
  BRL: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  MXN: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  ARS: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  CLP: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'before',
    decimalPlaces: 0,
  },
  COP: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'before',
    decimalPlaces: 0,
  },
  PEN: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },

  // Middle East / Africa
  AED: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  SAR: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  ILS: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  TRY: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    decimalPlaces: 2,
  },
  EGP: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  NGN: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  KES: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },

  // Eastern Europe / Russia
  RUB: {
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    decimalPlaces: 2,
  },
  UAH: {
    decimalSeparator: ',',
    thousandsSeparator: ' ',
    currencyPosition: 'after',
    decimalPlaces: 2,
  },

  // Other
  TWD: {
    decimalSeparator: '.',
    thousandsSeparator: ',',
    currencyPosition: 'before',
    decimalPlaces: 2,
  },
  ISK: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
    currencyPosition: 'after',
    decimalPlaces: 0,
  },
};

/**
 * Gets the standard number format for a currency code.
 *
 * @param currencyCode - ISO 4217 currency code (e.g., "EUR", "USD")
 * @returns NumberFormatOptions for the currency
 *
 * @example
 * getCurrencyFormat("EUR")
 * // Returns { decimalSeparator: ",", thousandsSeparator: ".", currencyPosition: "after", decimalPlaces: 2 }
 */
export function getCurrencyFormat(currencyCode: string | null | undefined): NumberFormatOptions {
  if (!currencyCode) return defaultNumberFormat;
  return CURRENCY_FORMATS[currencyCode.toUpperCase()] || defaultNumberFormat;
}

/**
 * Formats a number according to the provided formatting options.
 *
 * @param value - The number to format
 * @param options - Number formatting options
 * @returns Formatted number string
 *
 * @example
 * formatNumber(1234567.89, { decimalSeparator: ",", thousandsSeparator: ".", decimalPlaces: 2 })
 * // Returns "1.234.567,89"
 */
export function formatNumber(
  value: number | string | null | undefined,
  options: Partial<NumberFormatOptions> = {}
): string {
  if (value == null || value === '') return '';

  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '';

  const {
    decimalSeparator = defaultNumberFormat.decimalSeparator,
    thousandsSeparator = defaultNumberFormat.thousandsSeparator,
    decimalPlaces = defaultNumberFormat.decimalPlaces,
  } = options;

  // Format with fixed decimal places
  const fixed = numValue.toFixed(decimalPlaces);
  const [intPart, decPart] = fixed.split('.');

  // Add thousands separators
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);

  // Combine with decimal separator
  if (decimalPlaces > 0 && decPart) {
    return formattedInt + decimalSeparator + decPart;
  }

  return formattedInt;
}

/**
 * Formats a currency value with automatic formatting based on currency code.
 *
 * Uses the standard regional format for the given currency (decimal separator,
 * thousands separator, symbol position, decimal places).
 *
 * @param value - The amount to format
 * @param currency - ISO 4217 currency code (e.g., "EUR", "USD")
 * @returns Formatted currency string
 *
 * @example
 * formatCurrency(1234.56, "EUR")
 * // Returns "1.234,56 EUR" (European format)
 *
 * formatCurrency(1234.56, "USD")
 * // Returns "USD 1,234.56" (US format)
 *
 * formatCurrency(1234.56, "JPY")
 * // Returns "JPY 1,235" (no decimals for Yen)
 */
export function formatCurrency(
  value: number | string | null | undefined,
  currency: string | null | undefined
): string {
  // Get the standard format for this currency
  const format = getCurrencyFormat(currency);

  const formattedNumber = formatNumber(value, format);
  if (!formattedNumber) return '';

  const currencyCode = currency || '';

  if (!currencyCode) {
    return formattedNumber;
  }

  if (format.currencyPosition === 'before') {
    return `${currencyCode} ${formattedNumber}`;
  } else {
    return `${formattedNumber} ${currencyCode}`;
  }
}

/**
 * Formats a number using the format for a specific currency (without showing the currency code).
 *
 * Useful when you want to format numbers consistently with a currency's regional style
 * but don't want to display the currency code itself.
 *
 * @param value - The number to format
 * @param currency - ISO 4217 currency code to determine format
 * @returns Formatted number string
 *
 * @example
 * formatNumberForCurrency(1234.56, "EUR")
 * // Returns "1.234,56"
 */
export function formatNumberForCurrency(
  value: number | string | null | undefined,
  currency: string | null | undefined
): string {
  return formatNumber(value, getCurrencyFormat(currency));
}

/**
 * Parses a formatted number string back to a number.
 * Useful for parsing user input that uses custom separators.
 *
 * @param value - The formatted string to parse
 * @param options - Number formatting options used in the string
 * @returns Parsed number or NaN if invalid
 */
export function parseFormattedNumber(
  value: string,
  options: Partial<NumberFormatOptions> = {}
): number {
  if (!value || typeof value !== 'string') return NaN;

  const {
    decimalSeparator = defaultNumberFormat.decimalSeparator,
    thousandsSeparator = defaultNumberFormat.thousandsSeparator,
  } = options;

  // Remove thousands separators
  let cleaned = value;
  if (thousandsSeparator) {
    cleaned = cleaned.split(thousandsSeparator).join('');
  }

  // Replace decimal separator with standard "."
  if (decimalSeparator !== '.') {
    cleaned = cleaned.replace(decimalSeparator, '.');
  }

  return parseFloat(cleaned);
}

/**
 * Parses a currency-formatted string back to a number.
 *
 * @param value - The formatted currency string to parse
 * @param currency - ISO 4217 currency code to determine format
 * @returns Parsed number or NaN if invalid
 *
 * @example
 * parseFormattedCurrency("1.234,56 EUR", "EUR")
 * // Returns 1234.56
 */
export function parseFormattedCurrency(value: string, currency: string | null | undefined): number {
  if (!value || typeof value !== 'string') return NaN;

  // Remove currency code
  const currencyCode = currency?.toUpperCase() || '';
  const cleaned = value.replace(currencyCode, '').trim();

  return parseFormattedNumber(cleaned, getCurrencyFormat(currency));
}
