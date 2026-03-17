import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook that guards against losing unsaved changes via:
 * 1. Browser close/reload (beforeunload)
 * 2. Local state navigation like tab switching (guardNavigation)
 *
 * Usage:
 *   const { guardNavigation, showDialog, confirmLeave, cancelLeave } = useUnsavedChanges(isDirty);
 */
export function useUnsavedChanges(isDirty: boolean) {
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // 1. Browser close / reload
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // 2. Local state navigation (tab switching, etc.)
  const guardNavigation = useCallback((action: () => void) => {
    if (isDirtyRef.current) {
      setPendingAction(() => action);
    } else {
      action();
    }
  }, []);

  const confirmLeave = useCallback(() => {
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [pendingAction]);

  const cancelLeave = useCallback(() => {
    setPendingAction(null);
  }, []);

  const showDialog = pendingAction !== null;

  return { guardNavigation, showDialog, confirmLeave, cancelLeave };
}
