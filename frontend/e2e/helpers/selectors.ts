/** Common selector patterns used across the app */
export const SELECTORS = {
  spinner: '.animate-spin',
  modal: '[role="dialog"]',
  primaryButton: 'button[class*="bg-primary"]',
  errorMessage: '.bg-red-50, [class*="text-red-"]',
  contentArea: '.flex-1.min-w-0',
} as const;
