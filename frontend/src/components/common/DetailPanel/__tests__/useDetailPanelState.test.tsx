import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDetailPanelState } from '../useDetailPanelState';

interface Row {
  name: string;
  amount: number;
}

describe('useDetailPanelState', () => {
  it('starts clean (not dirty)', () => {
    const { result } = renderHook(() => useDetailPanelState<Row>({ name: 'a', amount: 1 }));
    expect(result.current.isDirty).toBe(false);
  });

  it('flips isDirty when setField changes a value', () => {
    const { result } = renderHook(() => useDetailPanelState<Row>({ name: 'a', amount: 1 }));
    act(() => result.current.setField('name', 'b'));
    expect(result.current.isDirty).toBe(true);
    expect(result.current.data.name).toBe('b');
  });

  it('reset returns to initial and clears dirty', () => {
    const { result } = renderHook(() => useDetailPanelState<Row>({ name: 'a', amount: 1 }));
    act(() => result.current.setField('name', 'b'));
    act(() => result.current.reset());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.data.name).toBe('a');
  });

  it('resets when the resetKey changes', () => {
    const { result, rerender } = renderHook(
      ({ initial, key }: { initial: Row; key: string }) => useDetailPanelState(initial, key),
      { initialProps: { initial: { name: 'a', amount: 1 }, key: 'row-1' } }
    );
    act(() => result.current.setField('name', 'b'));
    expect(result.current.isDirty).toBe(true);
    rerender({ initial: { name: 'x', amount: 9 }, key: 'row-2' });
    expect(result.current.data).toEqual({ name: 'x', amount: 9 });
    expect(result.current.isDirty).toBe(false);
  });

  it('ignores new initialData identity when the resetKey is unchanged', () => {
    const { result, rerender } = renderHook(
      ({ initial, key }: { initial: Row; key: string }) => useDetailPanelState(initial, key),
      { initialProps: { initial: { name: 'a', amount: 1 }, key: 'row-1' } }
    );
    act(() => result.current.setField('name', 'b'));
    // Parent re-renders with a new object literal but same key — do not stomp
    // the user's in-progress edits.
    rerender({ initial: { name: 'a', amount: 1 }, key: 'row-1' });
    expect(result.current.data.name).toBe('b');
    expect(result.current.isDirty).toBe(true);
  });
});
