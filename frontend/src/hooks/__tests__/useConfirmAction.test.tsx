import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useConfirmAction } from '../useConfirmAction';

interface Item {
  id: string;
}

describe('useConfirmAction', () => {
  it('starts closed, idle, and with no target', () => {
    const { result } = renderHook(() => useConfirmAction<Item>(async () => {}));
    expect(result.current.target).toBeNull();
    expect(result.current.isOpen).toBe(false);
    expect(result.current.isPending).toBe(false);
  });

  it('confirm(item) stages a target and opens', () => {
    const { result } = renderHook(() => useConfirmAction<Item>(async () => {}));
    act(() => result.current.confirm({ id: 'x' }));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.target).toEqual({ id: 'x' });
  });

  it('cancel() clears the target without running the action', () => {
    const action = vi.fn(async () => {});
    const { result } = renderHook(() => useConfirmAction<Item>(action));
    act(() => result.current.confirm({ id: 'x' }));
    act(() => result.current.cancel());
    expect(result.current.target).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it('execute() runs the action against the staged target and clears on success', async () => {
    const action = vi.fn(async (item: Item) => `ran-${item.id}`);
    const { result } = renderHook(() => useConfirmAction<Item, string>(action));

    act(() => result.current.confirm({ id: 'x' }));

    let returned: string | undefined;
    await act(async () => {
      returned = await result.current.execute();
    });

    expect(action).toHaveBeenCalledWith({ id: 'x' });
    expect(returned).toBe('ran-x');
    expect(result.current.target).toBeNull();
    expect(result.current.isPending).toBe(false);
  });

  it('execute() flips isPending while the action is in flight', async () => {
    let resolveAction: (() => void) | undefined;
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        })
    );
    const { result } = renderHook(() => useConfirmAction<Item>(action));

    act(() => result.current.confirm({ id: 'x' }));

    let executePromise: Promise<unknown> | undefined;
    act(() => {
      executePromise = result.current.execute();
    });

    await waitFor(() => expect(result.current.isPending).toBe(true));

    await act(async () => {
      resolveAction?.();
      await executePromise;
    });

    expect(result.current.isPending).toBe(false);
  });

  it('execute() rejection leaves the dialog open and propagates', async () => {
    const action = vi.fn(async () => {
      throw new Error('nope');
    });
    const { result } = renderHook(() => useConfirmAction<Item>(action));

    act(() => result.current.confirm({ id: 'x' }));

    await act(async () => {
      await expect(result.current.execute()).rejects.toThrow('nope');
    });

    expect(result.current.target).toEqual({ id: 'x' });
    expect(result.current.isPending).toBe(false);
  });

  it('execute() with no staged target is a no-op', async () => {
    const action = vi.fn(async () => 'hit');
    const { result } = renderHook(() => useConfirmAction<Item, string>(action));

    let returned: string | undefined;
    await act(async () => {
      returned = await result.current.execute();
    });

    expect(returned).toBeUndefined();
    expect(action).not.toHaveBeenCalled();
  });
});
