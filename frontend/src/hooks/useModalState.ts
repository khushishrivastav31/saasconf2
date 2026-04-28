import { useCallback, useState } from 'react';

/**
 * Generic confirm-dialog / preview-modal state.
 *
 * Replaces the ~30 sites that pair
 * `const [target, setTarget] = useState<T | null>(null)`
 * with hand-rolled `open(item)` / `close()` helpers and an `isOpen`
 * boolean computed from the target.
 *
 * Usage:
 *   const deleteModal = useModalState<Item>();
 *   ...
 *   <button onClick={() => deleteModal.open(item)}>Delete</button>
 *   {deleteModal.isOpen && <ConfirmDialog onCancel={deleteModal.close} item={deleteModal.target} />}
 */
export function useModalState<T>() {
  const [target, setTarget] = useState<T | null>(null);
  const open = useCallback((item: T) => setTarget(item), []);
  const close = useCallback(() => setTarget(null), []);
  return { target, isOpen: target !== null, open, close };
}
