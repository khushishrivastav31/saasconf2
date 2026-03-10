/**
 * Hook for automatic VAT calculation based on billing country and VAT number
 *
 * Provides consistent VAT recalculation logic across registration flows.
 */

import { useState, useEffect, useCallback } from 'react';
import type { VatCalculation } from '../types/publicRegistration';

export interface UseVatCalculationOptions {
  calculateVat: (subtotal: number, country: string, vatNumber: string | null) => Promise<void>;
  country: string;
  vatNumber: string | null;
  subtotal: number;
  enabled?: boolean; // Allow disabling auto-calculation
}

export function useVatCalculation({
  calculateVat,
  country,
  vatNumber,
  subtotal,
  enabled = true,
}: UseVatCalculationOptions) {
  const [vatCalculation, setVatCalculation] = useState<VatCalculation | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoized calculation function with loading state
  const performCalculation = useCallback(async () => {
    if (!enabled || !country || subtotal <= 0) {
      setVatCalculation(null);
      return;
    }

    setIsCalculating(true);
    setError(null);

    try {
      await calculateVat(subtotal, country, vatNumber);
    } catch (err) {
      console.error('VAT calculation error:', err);
      setError(err instanceof Error ? err.message : 'VAT calculation failed');
      setVatCalculation(null);
    } finally {
      setIsCalculating(false);
    }
  }, [enabled, country, vatNumber, subtotal, calculateVat]);

  // Auto-trigger calculation when dependencies change
  useEffect(() => {
    performCalculation();
  }, [performCalculation]);

  return {
    vatCalculation,
    setVatCalculation,
    isCalculating,
    error,
    recalculate: performCalculation, // Manual trigger if needed
  };
}
