import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useVatCalculation } from '../useVatCalculation';

describe('useVatCalculation', () => {
  let mockCalculateVat: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCalculateVat = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('starts with null vatCalculation and not calculating', () => {
    const { result } = renderHook(() =>
      useVatCalculation({
        calculateVat: mockCalculateVat,
        country: '',
        vatNumber: null,
        subtotal: 0,
        enabled: false,
      })
    );

    expect(result.current.vatCalculation).toBeNull();
    expect(result.current.isCalculating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('auto-triggers calculation when country and subtotal are valid', async () => {
    renderHook(() =>
      useVatCalculation({
        calculateVat: mockCalculateVat,
        country: 'DE',
        vatNumber: null,
        subtotal: 100,
      })
    );

    await waitFor(() => {
      expect(mockCalculateVat).toHaveBeenCalledWith(100, 'DE', null);
    });
  });

  it('does not calculate when country is empty', async () => {
    renderHook(() =>
      useVatCalculation({
        calculateVat: mockCalculateVat,
        country: '',
        vatNumber: null,
        subtotal: 100,
      })
    );

    // Give time for any potential async call
    await waitFor(() => {
      expect(mockCalculateVat).not.toHaveBeenCalled();
    });
  });

  it('does not calculate when subtotal is 0', async () => {
    renderHook(() =>
      useVatCalculation({
        calculateVat: mockCalculateVat,
        country: 'DE',
        vatNumber: null,
        subtotal: 0,
      })
    );

    await waitFor(() => {
      expect(mockCalculateVat).not.toHaveBeenCalled();
    });
  });

  it('does not calculate when subtotal is negative', async () => {
    renderHook(() =>
      useVatCalculation({
        calculateVat: mockCalculateVat,
        country: 'DE',
        vatNumber: null,
        subtotal: -50,
      })
    );

    await waitFor(() => {
      expect(mockCalculateVat).not.toHaveBeenCalled();
    });
  });

  it('does not calculate when disabled', async () => {
    renderHook(() =>
      useVatCalculation({
        calculateVat: mockCalculateVat,
        country: 'DE',
        vatNumber: null,
        subtotal: 100,
        enabled: false,
      })
    );

    await waitFor(() => {
      expect(mockCalculateVat).not.toHaveBeenCalled();
    });
  });

  it('passes vatNumber to calculateVat when provided', async () => {
    renderHook(() =>
      useVatCalculation({
        calculateVat: mockCalculateVat,
        country: 'DE',
        vatNumber: 'DE123456789',
        subtotal: 200,
      })
    );

    await waitFor(() => {
      expect(mockCalculateVat).toHaveBeenCalledWith(200, 'DE', 'DE123456789');
    });
  });

  it('sets error when calculateVat throws an Error', async () => {
    const failingCalc = vi.fn().mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() =>
      useVatCalculation({
        calculateVat: failingCalc,
        country: 'DE',
        vatNumber: null,
        subtotal: 100,
      })
    );

    await waitFor(() => {
      expect(result.current.error).toBe('Network error');
    });
    expect(result.current.vatCalculation).toBeNull();
    expect(result.current.isCalculating).toBe(false);
  });

  it('sets generic error when calculateVat throws a non-Error', async () => {
    const failingCalc = vi.fn().mockRejectedValue('something went wrong');

    const { result } = renderHook(() =>
      useVatCalculation({
        calculateVat: failingCalc,
        country: 'DE',
        vatNumber: null,
        subtotal: 100,
      })
    );

    await waitFor(() => {
      expect(result.current.error).toBe('VAT calculation failed');
    });
  });

  it('recalculates when country changes', async () => {
    const { rerender } = renderHook(
      ({ country }) =>
        useVatCalculation({
          calculateVat: mockCalculateVat,
          country,
          vatNumber: null,
          subtotal: 100,
        }),
      { initialProps: { country: 'DE' } }
    );

    await waitFor(() => {
      expect(mockCalculateVat).toHaveBeenCalledWith(100, 'DE', null);
    });

    mockCalculateVat.mockClear();

    rerender({ country: 'FR' });

    await waitFor(() => {
      expect(mockCalculateVat).toHaveBeenCalledWith(100, 'FR', null);
    });
  });

  it('recalculates when subtotal changes', async () => {
    const { rerender } = renderHook(
      ({ subtotal }) =>
        useVatCalculation({
          calculateVat: mockCalculateVat,
          country: 'DE',
          vatNumber: null,
          subtotal,
        }),
      { initialProps: { subtotal: 100 } }
    );

    await waitFor(() => {
      expect(mockCalculateVat).toHaveBeenCalledWith(100, 'DE', null);
    });

    mockCalculateVat.mockClear();

    rerender({ subtotal: 250 });

    await waitFor(() => {
      expect(mockCalculateVat).toHaveBeenCalledWith(250, 'DE', null);
    });
  });

  it('exposes setVatCalculation to manually set calculation', () => {
    const { result } = renderHook(() =>
      useVatCalculation({
        calculateVat: mockCalculateVat,
        country: '',
        vatNumber: null,
        subtotal: 0,
        enabled: false,
      })
    );

    act(() => {
      result.current.setVatCalculation({
        vat_rate: 19,
        vat_amount: 19,
        total: 119,
      });
    });

    expect(result.current.vatCalculation).toEqual({
      vat_rate: 19,
      vat_amount: 19,
      total: 119,
    });
  });

  it('exposes recalculate for manual triggering', async () => {
    const { result } = renderHook(() =>
      useVatCalculation({
        calculateVat: mockCalculateVat,
        country: 'DE',
        vatNumber: null,
        subtotal: 100,
      })
    );

    await waitFor(() => {
      expect(mockCalculateVat).toHaveBeenCalledTimes(1);
    });

    mockCalculateVat.mockClear();

    await act(async () => {
      await result.current.recalculate();
    });

    expect(mockCalculateVat).toHaveBeenCalledTimes(1);
  });
});
