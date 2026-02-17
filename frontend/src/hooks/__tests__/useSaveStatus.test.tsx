import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSaveStatus } from '../useSaveStatus';

describe('useSaveStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with idle status', () => {
    const { result } = renderHook(() => useSaveStatus());
    expect(result.current.saveStatus).toBe('idle');
  });

  it('setSaving sets status to saving', () => {
    const { result } = renderHook(() => useSaveStatus());

    act(() => {
      result.current.setSaving();
    });

    expect(result.current.saveStatus).toBe('saving');
  });

  it('setSaved sets status to saved', () => {
    const { result } = renderHook(() => useSaveStatus());

    act(() => {
      result.current.setSaved();
    });

    expect(result.current.saveStatus).toBe('saved');
  });

  it('setSaved resets to idle after 2 seconds', () => {
    const { result } = renderHook(() => useSaveStatus());

    act(() => {
      result.current.setSaved();
    });
    expect(result.current.saveStatus).toBe('saved');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.saveStatus).toBe('idle');
  });

  it('setSaved does not reset before 2 seconds', () => {
    const { result } = renderHook(() => useSaveStatus());

    act(() => {
      result.current.setSaved();
    });

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(result.current.saveStatus).toBe('saved');
  });

  it('setError sets status to error', () => {
    const { result } = renderHook(() => useSaveStatus());

    act(() => {
      result.current.setError();
    });

    expect(result.current.saveStatus).toBe('error');
  });

  it('setError resets to idle after 3 seconds', () => {
    const { result } = renderHook(() => useSaveStatus());

    act(() => {
      result.current.setError();
    });
    expect(result.current.saveStatus).toBe('error');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.saveStatus).toBe('idle');
  });

  it('setError does not reset before 3 seconds', () => {
    const { result } = renderHook(() => useSaveStatus());

    act(() => {
      result.current.setError();
    });

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(result.current.saveStatus).toBe('error');
  });

  it('setSaving cancels pending saved timeout', () => {
    const { result } = renderHook(() => useSaveStatus());

    // Set saved (starts 2s timer)
    act(() => {
      result.current.setSaved();
    });
    expect(result.current.saveStatus).toBe('saved');

    // Immediately set saving (should cancel the saved timer)
    act(() => {
      result.current.setSaving();
    });
    expect(result.current.saveStatus).toBe('saving');

    // After 2 seconds, should still be "saving", not "idle"
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.saveStatus).toBe('saving');
  });

  it('setSaving cancels pending error timeout', () => {
    const { result } = renderHook(() => useSaveStatus());

    act(() => {
      result.current.setError();
    });

    act(() => {
      result.current.setSaving();
    });
    expect(result.current.saveStatus).toBe('saving');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.saveStatus).toBe('saving');
  });

  it('setSaved cancels pending error timeout', () => {
    const { result } = renderHook(() => useSaveStatus());

    act(() => {
      result.current.setError();
    });

    act(() => {
      result.current.setSaved();
    });
    expect(result.current.saveStatus).toBe('saved');

    // error's 3s should not fire, only saved's 2s
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.saveStatus).toBe('idle');
  });

  it('full lifecycle: idle -> saving -> saved -> idle', () => {
    const { result } = renderHook(() => useSaveStatus());

    expect(result.current.saveStatus).toBe('idle');

    act(() => {
      result.current.setSaving();
    });
    expect(result.current.saveStatus).toBe('saving');

    act(() => {
      result.current.setSaved();
    });
    expect(result.current.saveStatus).toBe('saved');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.saveStatus).toBe('idle');
  });

  it('full lifecycle: idle -> saving -> error -> idle', () => {
    const { result } = renderHook(() => useSaveStatus());

    expect(result.current.saveStatus).toBe('idle');

    act(() => {
      result.current.setSaving();
    });
    expect(result.current.saveStatus).toBe('saving');

    act(() => {
      result.current.setError();
    });
    expect(result.current.saveStatus).toBe('error');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.saveStatus).toBe('idle');
  });

  it('cleans up timeout on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const { result, unmount } = renderHook(() => useSaveStatus());

    act(() => {
      result.current.setSaved();
    });

    unmount();

    // clearTimeout should have been called during cleanup
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('returns stable function references', () => {
    const { result, rerender } = renderHook(() => useSaveStatus());

    const firstSaving = result.current.setSaving;
    const firstSaved = result.current.setSaved;
    const firstError = result.current.setError;

    rerender();

    expect(result.current.setSaving).toBe(firstSaving);
    expect(result.current.setSaved).toBe(firstSaved);
    expect(result.current.setError).toBe(firstError);
  });
});
