import { useCallback, useState } from 'react';

/**
 * Delete-with-confirm pattern used by ~8 admin tabs:
 *
 * 1. User clicks a trash icon → call `confirm(item)`.
 * 2. A dialog reads `target` / `isOpen` and asks for confirmation.
 * 3. The dialog's "Yes" button calls `execute()`.
 * 4. The dialog's "Cancel" calls `cancel()`.
 *
 * `execute` runs the supplied async `action` against the staged
 * target, exposes an `isPending` flag for the duration of the call,
 * and clears the target on success. Rejections leave the dialog open
 * and re-throw so callers can surface the error.
 */
export function useConfirmAction<T, R = void>(action: (item: T) => Promise<R>) {
  const [target, setTarget] = useState<T | null>(null);
  const [isPending, setIsPending] = useState(false);

  const confirm = useCallback((item: T) => setTarget(item), []);
  const cancel = useCallback(() => setTarget(null), []);

  const execute = useCallback(async (): Promise<R | undefined> => {
    if (target === null) return undefined;
    setIsPending(true);
    try {
      const result = await action(target);
      setTarget(null);
      return result;
    } finally {
      setIsPending(false);
    }
  }, [target, action]);

  return { target, isOpen: target !== null, isPending, confirm, cancel, execute };
}
