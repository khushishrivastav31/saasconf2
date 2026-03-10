import { useState, useCallback, useRef } from 'react';
import type { AxiosInstance } from 'axios';
import api from '../config/api';
import { EU_COUNTRY_CODES } from '../config/countries';

export type VatStatus = 'idle' | 'checking' | 'valid' | 'invalid' | 'uncertain';

interface UseVatValidationOptions {
  /** Custom API client (e.g., publicApi for unauthenticated requests) */
  apiClient?: AxiosInstance;
  /** Custom endpoint path (defaults to '/my-company/validate-vat') */
  endpoint?: string;
}

interface UseVatValidationReturn {
  status: VatStatus;
  message: string | null;
  validate: (vatNumber: string, country?: string) => Promise<boolean | null>;
  reset: () => void;
}

/** Reverse-map VAT prefix to country code (only exceptions where prefix !== country code). */
const VAT_PREFIX_TO_COUNTRY: Record<string, string> = { EL: 'GR' };

function extractCountryFromVat(vat: string): string | null {
  if (!vat || vat.length < 2) return null;
  const prefix = vat.slice(0, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(prefix)) return null;
  const country = VAT_PREFIX_TO_COUNTRY[prefix] || prefix;
  return EU_COUNTRY_CODES.has(country) ? country : null;
}

export function useVatValidation(options: UseVatValidationOptions = {}): UseVatValidationReturn {
  const { apiClient = api, endpoint = '/my-company/validate-vat' } = options;

  const [status, setStatus] = useState<VatStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef(0);

  const reset = useCallback(() => {
    setStatus('idle');
    setMessage(null);
  }, []);

  const validate = useCallback(
    async (vatNumber: string, country?: string): Promise<boolean | null> => {
      const trimmed = (vatNumber || '').trim();
      if (!trimmed) {
        reset();
        return null;
      }

      // Resolve country: explicit param > extract from VAT prefix
      const resolvedCountry = country || extractCountryFromVat(trimmed) || undefined;

      // Always call the API for full 3-stage validation (stdnum + regex + VIES)
      const id = ++requestId.current;
      setStatus('checking');
      setMessage(null);

      try {
        const response = await apiClient.post(endpoint, null, {
          params: {
            vat_number: trimmed,
            country: resolvedCountry || trimmed.slice(0, 2).toUpperCase(),
          },
        });
        // Ignore stale responses
        if (id !== requestId.current) return null;

        const result = response.data;
        if (result.valid === true) {
          setStatus('valid');
          setMessage(null);
          return true;
        } else if (result.valid === false) {
          setStatus('invalid');
          setMessage(result.message || 'VAT number could not be verified');
          return false;
        } else {
          setStatus('uncertain');
          setMessage(result.message || 'Could not verify VAT number online');
          return null;
        }
      } catch {
        if (id !== requestId.current) return null;
        setStatus('idle');
        setMessage(null);
        return null;
      }
    },
    [reset, apiClient, endpoint]
  );

  return { status, message, validate, reset };
}
