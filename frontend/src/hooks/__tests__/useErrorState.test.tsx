import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useErrorState } from '../useErrorState';

describe('useErrorState', () => {
  it('starts as null by default', () => {
    const { result } = renderHook(() => useErrorState());
    expect(result.current[0]).toBeNull();
  });

  it('honours an initial value', () => {
    const { result } = renderHook(() => useErrorState('boom'));
    expect(result.current[0]).toBe('boom');
  });

  it('updates via the tuple setter', () => {
    const { result } = renderHook(() => useErrorState());
    act(() => result.current[1]('failed'));
    expect(result.current[0]).toBe('failed');
    act(() => result.current[1](null));
    expect(result.current[0]).toBeNull();
  });
});
