import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModalState } from '../useModalState';

interface Item {
  id: string;
  name: string;
}

describe('useModalState', () => {
  it('starts closed with a null target', () => {
    const { result } = renderHook(() => useModalState<Item>());
    expect(result.current.target).toBeNull();
    expect(result.current.isOpen).toBe(false);
  });

  it('open(item) stages the target and flips isOpen', () => {
    const { result } = renderHook(() => useModalState<Item>());
    const item: Item = { id: 'a', name: 'first' };

    act(() => result.current.open(item));

    expect(result.current.target).toBe(item);
    expect(result.current.isOpen).toBe(true);
  });

  it('close() clears the target', () => {
    const { result } = renderHook(() => useModalState<Item>());
    act(() => result.current.open({ id: 'a', name: 'first' }));
    act(() => result.current.close());
    expect(result.current.target).toBeNull();
    expect(result.current.isOpen).toBe(false);
  });

  it('returns stable open/close references across renders', () => {
    const { result, rerender } = renderHook(() => useModalState<Item>());
    const firstOpen = result.current.open;
    const firstClose = result.current.close;
    rerender();
    expect(result.current.open).toBe(firstOpen);
    expect(result.current.close).toBe(firstClose);
  });
});
