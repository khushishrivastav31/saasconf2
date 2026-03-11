import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVatValidation } from '../useVatValidation';

// Mock the default api client
vi.mock('../../config/api', () => ({
  default: {
    post: vi.fn(),
  },
}));

// Mock EU_COUNTRY_CODES
vi.mock('../../config/countries', () => ({
  EU_COUNTRY_CODES: new Set([
    'AT',
    'BE',
    'BG',
    'HR',
    'CY',
    'CZ',
    'DK',
    'EE',
    'FI',
    'FR',
    'DE',
    'GR',
    'HU',
    'IE',
    'IT',
    'LV',
    'LT',
    'LU',
    'MT',
    'NL',
    'PL',
    'PT',
    'RO',
    'SK',
    'SI',
    'ES',
    'SE',
  ]),
  COUNTRY_OPTIONS: [],
}));

import api from '../../config/api';

describe('useVatValidation', () => {
  const mockPost = api.post as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockPost.mockReset();
  });

  it('starts with idle status and null message', () => {
    const { result } = renderHook(() => useVatValidation());

    expect(result.current.status).toBe('idle');
    expect(result.current.message).toBeNull();
  });

  describe('validate', () => {
    it('returns null and resets for empty VAT number', async () => {
      const { result } = renderHook(() => useVatValidation());

      let returnValue: boolean | null = false;
      await act(async () => {
        returnValue = await result.current.validate('');
      });

      expect(returnValue).toBeNull();
      expect(result.current.status).toBe('idle');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('returns null and resets for whitespace-only VAT number', async () => {
      const { result } = renderHook(() => useVatValidation());

      let returnValue: boolean | null = false;
      await act(async () => {
        returnValue = await result.current.validate('   ');
      });

      expect(returnValue).toBeNull();
      expect(result.current.status).toBe('idle');
    });

    it('returns true and sets status to valid for valid VAT', async () => {
      mockPost.mockResolvedValueOnce({ data: { valid: true } });

      const { result } = renderHook(() => useVatValidation());

      let returnValue: boolean | null = null;
      await act(async () => {
        returnValue = await result.current.validate('DE123456789');
      });

      expect(returnValue).toBe(true);
      expect(result.current.status).toBe('valid');
      expect(result.current.message).toBeNull();
    });

    it('returns false and sets status to invalid with message', async () => {
      mockPost.mockResolvedValueOnce({
        data: { valid: false, message: 'Invalid format' },
      });

      const { result } = renderHook(() => useVatValidation());

      let returnValue: boolean | null = null;
      await act(async () => {
        returnValue = await result.current.validate('DE000000000');
      });

      expect(returnValue).toBe(false);
      expect(result.current.status).toBe('invalid');
      expect(result.current.message).toBe('Invalid format');
    });

    it('uses default message when API returns invalid without message', async () => {
      mockPost.mockResolvedValueOnce({ data: { valid: false } });

      const { result } = renderHook(() => useVatValidation());

      await act(async () => {
        await result.current.validate('DE000000000');
      });

      expect(result.current.message).toBe('VAT number could not be verified');
    });

    it('sets uncertain status when valid is null/undefined', async () => {
      mockPost.mockResolvedValueOnce({
        data: { valid: null, message: 'VIES service unavailable' },
      });

      const { result } = renderHook(() => useVatValidation());

      let returnValue: boolean | null = false;
      await act(async () => {
        returnValue = await result.current.validate('DE123456789');
      });

      expect(returnValue).toBeNull();
      expect(result.current.status).toBe('uncertain');
      expect(result.current.message).toBe('VIES service unavailable');
    });

    it('uses default uncertain message when API returns none', async () => {
      mockPost.mockResolvedValueOnce({ data: {} });

      const { result } = renderHook(() => useVatValidation());

      await act(async () => {
        await result.current.validate('DE123456789');
      });

      expect(result.current.message).toBe('Could not verify VAT number online');
    });

    it('calls API with correct parameters', async () => {
      mockPost.mockResolvedValueOnce({ data: { valid: true } });

      const { result } = renderHook(() => useVatValidation());

      await act(async () => {
        await result.current.validate('DE123456789', 'DE');
      });

      expect(mockPost).toHaveBeenCalledWith('/my-company/validate-vat', null, {
        params: {
          vat_number: 'DE123456789',
          country: 'DE',
        },
      });
    });

    it('extracts country from VAT prefix when not provided explicitly', async () => {
      mockPost.mockResolvedValueOnce({ data: { valid: true } });

      const { result } = renderHook(() => useVatValidation());

      await act(async () => {
        await result.current.validate('FR12345678901');
      });

      expect(mockPost).toHaveBeenCalledWith('/my-company/validate-vat', null, {
        params: {
          vat_number: 'FR12345678901',
          country: 'FR',
        },
      });
    });

    it('maps EL prefix to GR country code', async () => {
      mockPost.mockResolvedValueOnce({ data: { valid: true } });

      const { result } = renderHook(() => useVatValidation());

      await act(async () => {
        await result.current.validate('EL123456789');
      });

      expect(mockPost).toHaveBeenCalledWith('/my-company/validate-vat', null, {
        params: {
          vat_number: 'EL123456789',
          country: 'GR',
        },
      });
    });

    it('uses prefix as-is for non-EU country codes', async () => {
      mockPost.mockResolvedValueOnce({ data: { valid: true } });

      const { result } = renderHook(() => useVatValidation());

      await act(async () => {
        await result.current.validate('US123456789');
      });

      // US is not in EU_COUNTRY_CODES, so extractCountryFromVat returns null
      // Falls back to trimmed.slice(0, 2).toUpperCase() = 'US'
      expect(mockPost).toHaveBeenCalledWith('/my-company/validate-vat', null, {
        params: {
          vat_number: 'US123456789',
          country: 'US',
        },
      });
    });

    it('resets to idle on API error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useVatValidation());

      let returnValue: boolean | null = false;
      await act(async () => {
        returnValue = await result.current.validate('DE123456789');
      });

      expect(returnValue).toBeNull();
      expect(result.current.status).toBe('idle');
      expect(result.current.message).toBeNull();
    });

    it('ignores stale responses', async () => {
      // First call resolves slowly
      let resolveFirst: (value: unknown) => void;
      const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });
      mockPost.mockReturnValueOnce(firstPromise);

      // Second call resolves immediately
      mockPost.mockResolvedValueOnce({ data: { valid: true } });

      const { result } = renderHook(() => useVatValidation());

      // Fire first validation (will be slow)
      const firstValidation = act(async () => {
        await result.current.validate('DE111111111');
      });

      // Fire second validation immediately (will complete first)
      await act(async () => {
        await result.current.validate('DE222222222');
      });

      // Now resolve the first (stale) response
      resolveFirst!({ data: { valid: false, message: 'Invalid' } });
      await firstValidation;

      // Status should reflect the second (most recent) call, not the stale first
      expect(result.current.status).toBe('valid');
    });

    it('trims whitespace from VAT number', async () => {
      mockPost.mockResolvedValueOnce({ data: { valid: true } });

      const { result } = renderHook(() => useVatValidation());

      await act(async () => {
        await result.current.validate('  DE123456789  ');
      });

      expect(mockPost).toHaveBeenCalledWith('/my-company/validate-vat', null, {
        params: {
          vat_number: 'DE123456789',
          country: 'DE',
        },
      });
    });
  });

  describe('reset', () => {
    it('resets status to idle and message to null', async () => {
      mockPost.mockResolvedValueOnce({
        data: { valid: false, message: 'Bad VAT' },
      });

      const { result } = renderHook(() => useVatValidation());

      await act(async () => {
        await result.current.validate('DE000');
      });

      expect(result.current.status).toBe('invalid');

      act(() => {
        result.current.reset();
      });

      expect(result.current.status).toBe('idle');
      expect(result.current.message).toBeNull();
    });
  });

  describe('custom options', () => {
    it('uses custom API client', async () => {
      const customClient = {
        post: vi.fn().mockResolvedValue({ data: { valid: true } }),
      };

      const { result } = renderHook(() =>
        useVatValidation({
          apiClient: customClient as unknown as typeof api,
        })
      );

      await act(async () => {
        await result.current.validate('DE123456789');
      });

      expect(customClient.post).toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('uses custom endpoint', async () => {
      mockPost.mockResolvedValueOnce({ data: { valid: true } });

      const { result } = renderHook(() => useVatValidation({ endpoint: '/custom/vat-check' }));

      await act(async () => {
        await result.current.validate('DE123456789');
      });

      expect(mockPost).toHaveBeenCalledWith('/custom/vat-check', null, expect.any(Object));
    });
  });
});
